import crypto from 'crypto';
import logger from '../utils/logger.js';
import { campaignService } from './campaignService.js';
import { emailService } from './emailService.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const SEQUENCES = {
  cold_outreach: {
    id: 'cold_outreach',
    name: 'Cold Outreach (Makler)',
    steps: [
      { type: 'email', templateId: 'seq_cold_1_intro', delayDays: 0 },
      { type: 'email', templateId: 'seq_cold_2_value', delayDays: 3 },
      { type: 'task', title: 'Follow-up prüfen', description: 'Antwort prüfen und ggf. manuell nachfassen.', delayDays: 4 },
      { type: 'email', templateId: 'seq_cold_3_followup', delayDays: 2 },
      { type: 'email', templateId: 'seq_cold_4_last_chance', delayDays: 5 }
    ]
  },
  enterprise_outreach: {
    id: 'enterprise_outreach',
    name: 'Enterprise Outreach',
    steps: [
      { type: 'email', templateId: 'seq_enterprise_1_intro', delayDays: 0 },
      { type: 'email', templateId: 'seq_enterprise_2_roi', delayDays: 4 },
      { type: 'email', templateId: 'seq_enterprise_3_case_study', delayDays: 5 }
    ]
  },
  solo_outreach: {
    id: 'solo_outreach',
    name: 'Solo Outreach',
    steps: [
      { type: 'email', templateId: 'seq_solo_1_intro', delayDays: 0 },
      { type: 'email', templateId: 'seq_solo_2_tools', delayDays: 4 }
    ]
  },
  regional_outreach: {
    id: 'regional_outreach',
    name: 'Regional Outreach',
    steps: [
      { type: 'email', templateId: 'seq_regional_1_intro', delayDays: 0 },
      { type: 'email', templateId: 'seq_regional_2_stats', delayDays: 4 }
    ]
  }
};

const nowIso = () => new Date().toISOString();

export class SequenceEngine {
  getAvailableSequences() {
    return Object.values(SEQUENCES).map(s => ({
      id: s.id,
      name: s.name,
      steps: s.steps.map((step, idx) => ({
        index: idx,
        type: step.type,
        templateId: step.templateId,
        title: step.title,
        delayDays: step.delayDays || 0
      }))
    }));
  }

  getSequence(sequenceId) {
    return SEQUENCES[sequenceId] || null;
  }

  isSendingEnabled() {
    return process.env.SEQUENCE_SENDING_ENABLED === 'true';
  }

  ensureCampaignStructures() {
    const campaign = campaignService.campaign;
    if (!campaign.sequenceTasks) campaign.sequenceTasks = [];
    return campaign;
  }

  buildTemplateVariables(contact, overrides = {}) {
    const prefix = contact.anrede === 'Frau' ? 'Sehr geehrte Frau' :
      contact.anrede === 'Herr' ? 'Sehr geehrter Herr' :
      'Guten Tag';
    const lastNameOrCompany = contact.nachname || contact.firma || '';
    const anrede = `${prefix} ${lastNameOrCompany}`.trim();

    return {
      anrede,
      vorname: contact.vorname || contact.nachname || contact.firma || '',
      firma: contact.firma || '',
      city: contact.geo?.city || contact.geo?.district || '',
      state: contact.geo?.state || '',
      booking_url: process.env.SEQUENCE_BOOKING_URL || 'https://booking.maklerplan.com',
      sender_name: process.env.SEQUENCE_SENDER_NAME || 'Ihr Maklerplan Team',
      ...overrides
    };
  }

  findContact(contactId) {
    const campaign = this.ensureCampaignStructures();
    return campaign.contacts.find(c => c.id === contactId) || null;
  }

  addContactToSequence(contactId, sequenceId, options = {}) {
    const sequence = this.getSequence(sequenceId);
    if (!sequence) throw new Error('Sequence not found');

    const campaign = this.ensureCampaignStructures();
    const contact = campaign.contacts.find(c => c.id === contactId);
    if (!contact) throw new Error('Contact not found');

    if (!contact.sequences) contact.sequences = [];

    const existing = contact.sequences.find(s =>
      s.sequenceId === sequenceId && s.status !== 'completed' && s.status !== 'stopped'
    );
    if (existing) {
      return { enrollment: existing, alreadyEnrolled: true };
    }

    const startedAt = options.startedAt || nowIso();
    const firstDelayDays = sequence.steps[0]?.delayDays || 0;

    const enrollment = {
      id: crypto.randomUUID(),
      sequenceId,
      status: 'active',
      currentStepIndex: 0,
      waitingTaskId: null,
      startedAt,
      updatedAt: nowIso(),
      lastActionAt: null,
      nextActionAt: new Date(new Date(startedAt).getTime() + firstDelayDays * DAY_MS).toISOString(),
      events: []
    };

    contact.sequences.push(enrollment);
    campaignService.saveCampaign();

    return { enrollment, alreadyEnrolled: false };
  }

  bulkAddToSequence(sequenceId, contactIds = []) {
    const results = { added: 0, alreadyEnrolled: 0, failed: 0, errors: [] };

    for (const contactId of contactIds) {
      try {
        const res = this.addContactToSequence(contactId, sequenceId);
        if (res.alreadyEnrolled) results.alreadyEnrolled++;
        else results.added++;
      } catch (error) {
        results.failed++;
        results.errors.push({ contactId, error: error.message });
      }
    }

    return results;
  }

  getTasks(filters = {}) {
    const campaign = this.ensureCampaignStructures();
    let tasks = [...campaign.sequenceTasks];

    if (filters.status) {
      tasks = tasks.filter(t => t.status === filters.status);
    }

    tasks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return tasks.map(t => {
      const contact = campaign.contacts.find(c => c.id === t.contactId);
      return {
        ...t,
        contactName: contact ? `${contact.vorname || ''} ${contact.nachname || ''}`.trim() || contact.firma : '',
        contactEmail: contact?.email || t.contactEmail || ''
      };
    });
  }

  completeTask(taskId) {
    const campaign = this.ensureCampaignStructures();
    const task = campaign.sequenceTasks.find(t => t.id === taskId);
    if (!task) throw new Error('Task not found');

    if (task.status === 'done') {
      return { task, resumed: 0 };
    }

    task.status = 'done';
    task.completedAt = nowIso();

    let resumed = 0;
    for (const contact of campaign.contacts) {
      if (!contact.sequences) continue;
      for (const enrollment of contact.sequences) {
        if (enrollment.waitingTaskId !== taskId) continue;

        const sequence = this.getSequence(enrollment.sequenceId);
        if (!sequence) {
          enrollment.status = 'stopped';
          enrollment.waitingTaskId = null;
          enrollment.updatedAt = nowIso();
          continue;
        }

        const nextStep = sequence.steps[enrollment.currentStepIndex];
        if (!nextStep) {
          enrollment.status = 'completed';
          enrollment.waitingTaskId = null;
          enrollment.nextActionAt = null;
          enrollment.updatedAt = nowIso();
          resumed++;
          continue;
        }

        enrollment.status = 'active';
        enrollment.waitingTaskId = null;
        enrollment.nextActionAt = new Date(Date.now() + (nextStep.delayDays || 0) * DAY_MS).toISOString();
        enrollment.updatedAt = nowIso();
        resumed++;
      }
    }

    campaignService.saveCampaign();
    return { task, resumed };
  }

  getStats() {
    const campaign = this.ensureCampaignStructures();
    const statsBySequence = {};

    for (const seq of Object.values(SEQUENCES)) {
      statsBySequence[seq.id] = { active: 0, waiting_task: 0, completed: 0, stopped: 0, total: 0 };
    }

    for (const contact of campaign.contacts) {
      if (!contact.sequences) continue;
      for (const enrollment of contact.sequences) {
        const bucket = statsBySequence[enrollment.sequenceId];
        if (!bucket) continue;
        bucket.total++;
        bucket[enrollment.status] = (bucket[enrollment.status] || 0) + 1;
      }
    }

    const openTasks = campaign.sequenceTasks.filter(t => t.status === 'open').length;
    const doneTasks = campaign.sequenceTasks.filter(t => t.status === 'done').length;

    return { sequences: statsBySequence, tasks: { open: openTasks, done: doneTasks, total: openTasks + doneTasks } };
  }

  async processDueSteps({ limit = 100, dryRun, ignoreDelays = false } = {}) {
    const campaign = this.ensureCampaignStructures();
    const sendingEnabled = this.isSendingEnabled();
    const resolvedMode = (() => {
      if (dryRun === true) return 'dryRun';
      if (dryRun === false) {
        if (!sendingEnabled) {
          throw new Error('Sequence sending disabled (set SEQUENCE_SENDING_ENABLED=true)');
        }
        return 'send';
      }

      return sendingEnabled ? 'send' : 'hold';
    })();

    if (ignoreDelays && resolvedMode !== 'dryRun') {
      throw new Error('ignoreDelays only allowed with dryRun: true');
    }

    let dirty = false;

    const results = {
      processed: 0,
      emailsSent: 0,
      emailsDryRun: 0,
      tasksCreated: 0,
      completed: 0,
      errors: []
    };

    const now = Date.now();
    const nowStr = nowIso();

    for (const contact of campaign.contacts) {
      if (results.processed >= limit) break;
      if (!contact.sequences || contact.sequences.length === 0) continue;

      for (const enrollment of contact.sequences) {
        if (results.processed >= limit) break;
        if (!enrollment || enrollment.status === 'completed' || enrollment.status === 'stopped') continue;

        const sequence = this.getSequence(enrollment.sequenceId);
        if (!sequence) {
          enrollment.status = 'stopped';
          enrollment.updatedAt = nowStr;
          dirty = true;
          continue;
        }

        if (enrollment.status === 'waiting_task') {
          const task = campaign.sequenceTasks.find(t => t.id === enrollment.waitingTaskId);
          if (task && task.status === 'done') {
            enrollment.status = 'active';
            enrollment.waitingTaskId = null;
            const nextStep = sequence.steps[enrollment.currentStepIndex];
            if (nextStep) {
              enrollment.nextActionAt = new Date(now + (nextStep.delayDays || 0) * DAY_MS).toISOString();
            } else {
              enrollment.status = 'completed';
              enrollment.nextActionAt = null;
              results.completed++;
            }
            enrollment.updatedAt = nowStr;
            dirty = true;
          } else {
            continue;
          }
        }

        if (enrollment.status !== 'active') continue;

        const dueAt = ignoreDelays ? now : (enrollment.nextActionAt ? new Date(enrollment.nextActionAt).getTime() : now);
        if (dueAt > now) continue;

        const step = sequence.steps[enrollment.currentStepIndex];
        if (!step) {
          enrollment.status = 'completed';
          enrollment.nextActionAt = null;
          enrollment.updatedAt = nowStr;
          dirty = true;
          results.completed++;
          continue;
        }

        try {
          if (step.type === 'email') {
            if (resolvedMode === 'hold') {
              continue;
            }

            const variables = this.buildTemplateVariables(contact);

            if (resolvedMode === 'send') {
              await emailService.sendTemplateEmail({
                to: contact.email,
                templateId: step.templateId,
                variables
              });
              results.emailsSent++;
            } else {
              results.emailsDryRun++;
            }

            enrollment.events = enrollment.events || [];
            enrollment.events.push({
              at: nowStr,
              type: 'email',
              templateId: step.templateId,
              dryRun: resolvedMode === 'dryRun'
            });

            enrollment.lastActionAt = nowStr;
            enrollment.updatedAt = nowStr;
            enrollment.currentStepIndex++;
            dirty = true;

            const nextStep = sequence.steps[enrollment.currentStepIndex];
            if (nextStep) {
              enrollment.nextActionAt = new Date(now + (nextStep.delayDays || 0) * DAY_MS).toISOString();
            } else {
              enrollment.status = 'completed';
              enrollment.nextActionAt = null;
              results.completed++;
            }
          } else if (step.type === 'task') {
            const task = {
              id: crypto.randomUUID(),
              contactId: contact.id,
              contactEmail: contact.email,
              sequenceId: enrollment.sequenceId,
              stepIndex: enrollment.currentStepIndex,
              title: step.title,
              description: step.description || '',
              status: 'open',
              createdAt: nowStr,
              dueAt: nowStr
            };

            campaign.sequenceTasks.push(task);
            dirty = true;

            enrollment.events = enrollment.events || [];
            enrollment.events.push({
              at: nowStr,
              type: 'task',
              taskId: task.id,
              title: task.title
            });

            enrollment.currentStepIndex++;
            enrollment.status = 'waiting_task';
            enrollment.waitingTaskId = task.id;
            enrollment.lastActionAt = nowStr;
            enrollment.updatedAt = nowStr;
            enrollment.nextActionAt = null;

            results.tasksCreated++;
          }

          results.processed++;
        } catch (error) {
          logger.error('Sequence processing error', { error: error.message, contactId: contact.id, sequenceId: enrollment.sequenceId });
          results.errors.push({ contactId: contact.id, sequenceId: enrollment.sequenceId, error: error.message });
        }
      }
    }

    if (dirty || results.processed > 0 || results.completed > 0 || results.tasksCreated > 0) {
      campaignService.saveCampaign();
    }

    return results;
  }
}

export const sequenceEngine = new SequenceEngine();
export default sequenceEngine;
