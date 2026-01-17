/**
 * Unified Pipeline Service
 * Automatisierte Pipeline: Lead → Customer
 * Sequenzen, Automations, Trigger
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { unifiedContactService, STAGES, SOURCES } from './unifiedContactService.js';
import { communicationService } from './communicationService.js';
import { brandingService } from './brandingService.js';
import logger from '../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SEQUENCES_PATH = path.join(__dirname, '../../data/unified-sequences.json');
const AUTOMATIONS_PATH = path.join(__dirname, '../../data/unified-automations.json');

// ============================================
// SEQUENCE TEMPLATES
// ============================================

export const SEQUENCE_TEMPLATES = {
  // Maklerplan - Bestandskunden
  maklerplan_neujahr: {
    id: 'maklerplan_neujahr',
    name: 'Maklerplan Neujahres-Update',
    brand: 'maklerplan',
    steps: [
      { day: 0, type: 'email', templateId: 'neujahr_intro' },
      { day: 3, type: 'email', templateId: 'neujahr_reminder' },
      { day: 7, type: 'email', templateId: 'neujahr_lastchance' }
    ]
  },
  
  // Maklerplan - Neukundenakquise (Makler)
  maklerplan_outreach: {
    id: 'maklerplan_outreach',
    name: 'Maklerplan Makler-Outreach',
    brand: 'maklerplan',
    steps: [
      { day: 0, type: 'email', templateId: 'outreach_intro' },
      { day: 3, type: 'email', templateId: 'outreach_value' },
      { day: 7, type: 'email', templateId: 'outreach_socialproof' },
      { day: 12, type: 'email', templateId: 'outreach_urgency' },
      { day: 19, type: 'email', templateId: 'outreach_breakup' }
    ]
  },
  
  // Leadquelle - Multi-Branchen
  leadquelle_standard: {
    id: 'leadquelle_standard',
    name: 'Leadquelle Standard-Sequenz',
    brand: 'leadquelle',
    steps: [
      { day: 0, type: 'email', templateId: 'lq_intro' },
      { day: 3, type: 'email', templateId: 'lq_value' },
      { day: 8, type: 'email', templateId: 'lq_socialproof' },
      { day: 12, type: 'email', templateId: 'lq_urgency' },
      { day: 19, type: 'email', templateId: 'lq_breakup' }
    ]
  },
  
  // Post-Meeting Follow-Up
  post_meeting: {
    id: 'post_meeting',
    name: 'Post-Meeting Follow-Up',
    brand: 'auto', // Nimmt Brand vom Contact
    steps: [
      { day: 0, type: 'email', templateId: 'pm_thankyou' },
      { day: 3, type: 'email', templateId: 'pm_questions' },
      { day: 7, type: 'email', templateId: 'pm_offer' },
      { day: 14, type: 'email', templateId: 'pm_lastchance' }
    ]
  },
  
  // No-Show Recovery
  no_show_recovery: {
    id: 'no_show_recovery',
    name: 'No-Show Recovery',
    brand: 'auto',
    steps: [
      { day: 0, type: 'email', templateId: 'noshow_missed' },
      { day: 1, type: 'email', templateId: 'noshow_reschedule' }
    ]
  },
  
  // Win-Back (Inaktive Kunden)
  winback: {
    id: 'winback',
    name: 'Win-Back Kampagne',
    brand: 'auto',
    steps: [
      { day: 0, type: 'email', templateId: 'wb_checkin' },
      { day: 5, type: 'email', templateId: 'wb_offer' },
      { day: 12, type: 'email', templateId: 'wb_lastchance' }
    ]
  }
};

// ============================================
// EMAIL TEMPLATES
// ============================================

export const EMAIL_TEMPLATES = {
  // Leadquelle Templates
  lq_intro: {
    subject: '{{firstName}}, mehr Kunden für Ihr Geschäft?',
    html: `
      <h1>Hallo {{firstName}},</h1>
      <p>Sie wurden uns als Top-Unternehmen in Ihrer Branche empfohlen.</p>
      <p>Wir helfen Unternehmen wie Ihrem, jeden Monat 10-30 neue qualifizierte Anfragen zu generieren.</p>
      <p><strong>In nur 20 Minuten</strong> zeige ich Ihnen, wie das für {{company}} funktionieren kann.</p>
      {{booking_button}}
      <p>Kostenlos & unverbindlich.</p>
    `
  },
  lq_value: {
    subject: 'So gewinnen Sie mehr Kunden, {{firstName}}',
    html: `
      <h1>{{firstName}}, kurze Frage:</h1>
      <p>Wie viele Neukunden-Anfragen bekommen Sie aktuell pro Monat?</p>
      <p>Unsere Partner generieren durchschnittlich <strong>15-25 qualifizierte Anfragen</strong> pro Monat - automatisiert.</p>
      <p>Kein Cold-Calling. Keine Kaltakquise. Nur Interessenten, die Sie kontaktieren.</p>
      {{booking_button}}
    `
  },
  lq_socialproof: {
    subject: 'Wie {{similar_company}} 40% mehr Kunden gewinnt',
    html: `
      <h1>{{firstName}}, ein kurzer Einblick:</h1>
      <p>Ein Unternehmen aus Ihrer Branche hatte das gleiche Problem: Zu wenig Neukunden.</p>
      <p><strong>Nach 3 Monaten mit uns:</strong></p>
      <ul>
        <li>+40% mehr Anfragen</li>
        <li>Bessere Kundenqualität</li>
        <li>Planbare Auslastung</li>
      </ul>
      <p>Wollen Sie wissen, wie das für {{company}} funktionieren kann?</p>
      {{booking_button}}
    `
  },
  lq_urgency: {
    subject: '⏰ Letzte Plätze diesen Monat, {{firstName}}',
    html: `
      <h1>{{firstName}}, kurzes Update:</h1>
      <p>Wir nehmen diesen Monat nur noch <strong>3 neue Partner</strong> auf.</p>
      <p>Danach schließen wir die Aufnahme für 4-6 Wochen.</p>
      <p>Wenn Sie noch diesen Monat starten möchten:</p>
      {{booking_button}}
      <p>Keine Verpflichtung - nur ein Gespräch.</p>
    `
  },
  lq_breakup: {
    subject: 'Abschied, {{firstName}}?',
    html: `
      <h1>{{firstName}}, eine letzte Nachricht:</h1>
      <p>Ich habe Ihnen mehrmals geschrieben, aber keine Antwort erhalten.</p>
      <p>Ich respektiere das - vielleicht ist jetzt nicht der richtige Zeitpunkt.</p>
      <p>Falls Sie in Zukunft doch mehr Kunden gewinnen möchten, wissen Sie ja wo Sie mich finden.</p>
      <p>Alles Gute für {{company}}!</p>
    `
  },
  
  // Post-Meeting Templates
  pm_thankyou: {
    subject: '✅ Danke für das Gespräch, {{firstName}}!',
    html: `
      <h1>{{firstName}}, danke für Ihre Zeit!</h1>
      <p>Es war toll, Sie heute kennenzulernen.</p>
      <p>Wie besprochen, hier die wichtigsten Punkte:</p>
      <ul>
        <li>Ihre aktuelle Situation</li>
        <li>Unsere Lösung für Sie</li>
        <li>Die nächsten Schritte</li>
      </ul>
      <p>Bei Fragen - einfach antworten!</p>
    `
  },
  pm_questions: {
    subject: 'Noch Fragen, {{firstName}}?',
    html: `
      <h1>Hallo {{firstName}},</h1>
      <p>Ich wollte kurz nachfragen: Sind nach unserem Gespräch noch Fragen aufgekommen?</p>
      <p>Oft fallen einem die wichtigsten Punkte erst später ein.</p>
      <p>Antworten Sie einfach auf diese E-Mail!</p>
    `
  },
  pm_offer: {
    subject: '🎁 Exklusives Angebot für {{company}}',
    html: `
      <h1>{{firstName}}, ein besonderes Angebot:</h1>
      <p>Da wir bereits gesprochen haben, möchte ich Ihnen etwas Besonderes anbieten:</p>
      <div style="background: #fef3c7; padding: 20px; border-radius: 8px;">
        <strong>20% Rabatt auf den ersten Monat</strong>
        <p>Gültig noch diese Woche!</p>
      </div>
      <p>Interesse? Antworten Sie mit "JA".</p>
    `
  },
  pm_lastchance: {
    subject: '⏰ Letzte Nachricht, {{firstName}}',
    html: `
      <h1>{{firstName}}, eine letzte Frage:</h1>
      <p>Was hat Sie letztendlich davon abgehalten, mit uns zu starten?</p>
      <p>Ihr Feedback hilft mir, mich zu verbessern.</p>
      <p>Danke und alles Gute!</p>
    `
  },
  
  // No-Show Templates
  noshow_missed: {
    subject: 'Wir haben Sie vermisst, {{firstName}}!',
    html: `
      <h1>Hallo {{firstName}},</h1>
      <p>Leider konnten wir Sie bei unserem geplanten Termin nicht erreichen.</p>
      <p>Kein Problem - das passiert!</p>
      <p>Ich habe einen neuen Termin für Sie reserviert:</p>
      {{meeting_details}}
      {{booking_button}}
    `
  },
  noshow_reschedule: {
    subject: '📅 Neuer Termin für Sie, {{firstName}}',
    html: `
      <h1>{{firstName}}, hier Ihr neuer Termin:</h1>
      {{meeting_details}}
      <p>Falls dieser nicht passt, antworten Sie einfach mit einem Alternativvorschlag.</p>
      {{booking_button}}
    `
  }
};

class PipelineService {

  constructor() {
    this.activeSequences = this.loadSequences();
    this.automations = this.loadAutomations();
  }

  loadSequences() {
    try {
      if (fs.existsSync(SEQUENCES_PATH)) {
        return JSON.parse(fs.readFileSync(SEQUENCES_PATH, 'utf8'));
      }
    } catch (error) {
      logger.error('Sequences laden Fehler', { error: error.message });
    }
    return {};
  }

  loadAutomations() {
    try {
      if (fs.existsSync(AUTOMATIONS_PATH)) {
        return JSON.parse(fs.readFileSync(AUTOMATIONS_PATH, 'utf8'));
      }
    } catch (error) {
      logger.error('Automations laden Fehler', { error: error.message });
    }
    return { triggers: [], rules: [] };
  }

  saveSequences() {
    fs.writeFileSync(SEQUENCES_PATH, JSON.stringify(this.activeSequences, null, 2));
  }

  saveAutomations() {
    fs.writeFileSync(AUTOMATIONS_PATH, JSON.stringify(this.automations, null, 2));
  }

  // ============================================
  // SEQUENCE MANAGEMENT
  // ============================================

  /**
   * Startet eine Sequenz für einen Kontakt
   */
  startSequence(contactId, sequenceId) {
    const contact = unifiedContactService.getContact(contactId);
    if (!contact) throw new Error('Contact not found');
    if (contact.optedOut) throw new Error('Contact has opted out');

    const template = SEQUENCE_TEMPLATES[sequenceId];
    if (!template) throw new Error('Sequence template not found');

    const sequence = {
      id: `seq_${Date.now()}_${contactId}`,
      contactId,
      sequenceId,
      brand: template.brand === 'auto' ? contact.activeBrand : template.brand,
      currentStep: 0,
      startedAt: new Date().toISOString(),
      status: 'active',
      steps: template.steps.map((step, index) => ({
        ...step,
        index,
        status: 'pending',
        scheduledFor: this.calculateStepDate(step.day),
        sentAt: null
      }))
    };

    this.activeSequences[sequence.id] = sequence;
    
    // Contact updaten
    const contactData = unifiedContactService.getContact(contactId);
    contactData.activeSequence = sequence.id;
    contactData.sequenceStep = 0;
    unifiedContactService.saveContacts();

    this.saveSequences();
    
    logger.info('Sequence started', { contactId, sequenceId });
    return sequence;
  }

  calculateStepDate(daysFromNow) {
    const date = new Date();
    date.setDate(date.getDate() + daysFromNow);
    // Wochenende überspringen
    if (date.getDay() === 0) date.setDate(date.getDate() + 1);
    if (date.getDay() === 6) date.setDate(date.getDate() + 2);
    return date.toISOString();
  }

  /**
   * Stoppt eine Sequenz
   */
  stopSequence(sequenceInstanceId, reason = 'manual') {
    const sequence = this.activeSequences[sequenceInstanceId];
    if (!sequence) return { success: false, reason: 'not_found' };

    sequence.status = 'stopped';
    sequence.stoppedAt = new Date().toISOString();
    sequence.stopReason = reason;

    // Contact updaten
    const contact = unifiedContactService.getContact(sequence.contactId);
    if (contact) {
      contact.activeSequence = null;
      unifiedContactService.saveContacts();
    }

    this.saveSequences();
    logger.info('Sequence stopped', { sequenceInstanceId, reason });
    return { success: true };
  }

  /**
   * Verarbeitet alle fälligen Sequenz-Steps
   */
  async processSequences() {
    const now = new Date();
    let processed = 0;
    let errors = 0;

    for (const [id, sequence] of Object.entries(this.activeSequences)) {
      if (sequence.status !== 'active') continue;

      const contact = unifiedContactService.getContact(sequence.contactId);
      if (!contact || contact.optedOut) {
        this.stopSequence(id, 'contact_invalid');
        continue;
      }

      for (const step of sequence.steps) {
        if (step.status !== 'pending') continue;
        
        const scheduledDate = new Date(step.scheduledFor);
        if (scheduledDate > now) continue;

        try {
          await this.executeStep(sequence, step, contact);
          step.status = 'sent';
          step.sentAt = new Date().toISOString();
          sequence.currentStep = step.index + 1;
          processed++;
        } catch (error) {
          step.status = 'failed';
          step.error = error.message;
          errors++;
          logger.error('Sequence step failed', { sequenceId: id, step: step.index, error: error.message });
        }
      }

      // Sequenz abgeschlossen?
      if (sequence.steps.every(s => s.status !== 'pending')) {
        sequence.status = 'completed';
        sequence.completedAt = new Date().toISOString();
        
        const contactData = unifiedContactService.getContact(sequence.contactId);
        if (contactData) {
          contactData.activeSequence = null;
          unifiedContactService.saveContacts();
        }
      }

      this.saveSequences();
    }

    logger.info('Sequences processed', { processed, errors });
    return { processed, errors };
  }

  /**
   * Führt einen einzelnen Step aus
   */
  async executeStep(sequence, step, contact) {
    const template = EMAIL_TEMPLATES[step.templateId];
    if (!template) throw new Error(`Template not found: ${step.templateId}`);

    const brand = brandingService.getBrand(sequence.brand);

    // Template personalisieren
    let html = template.html
      .replace(/\{\{booking_button\}\}/g, brandingService.getButton(brand.id, '📅 Kostenloses Gespräch buchen', brand.bookingUrl))
      .replace(/\{\{similar_company\}\}/g, 'ein ähnliches Unternehmen');

    await communicationService.sendEmail(contact.id, {
      subject: template.subject,
      html,
      brand: brand.id,
      templateId: step.templateId
    });
  }

  // ============================================
  // AUTOMATION TRIGGERS
  // ============================================

  /**
   * Trigger bei Stage-Änderung
   */
  async onStageChange(contactId, fromStage, toStage) {
    const contact = unifiedContactService.getContact(contactId);
    if (!contact) return;

    // Meeting Done → Post-Meeting Sequenz
    if (toStage === STAGES.MEETING_DONE && !contact.activeSequence) {
      this.startSequence(contactId, 'post_meeting');
    }

    // Lost → Win-Back nach 30 Tagen (wird via Cron geprüft)
  }

  /**
   * Trigger bei neuem Kontakt
   */
  async onContactCreated(contactId, source) {
    const contact = unifiedContactService.getContact(contactId);
    if (!contact) return;

    // Automatisch Sequenz basierend auf Quelle starten
    if (source === SOURCES.LEADQUELLE || contact.activeBrand === 'leadquelle') {
      this.startSequence(contactId, 'leadquelle_standard');
    } else if (source === SOURCES.MAKLERPLAN_OUTREACH) {
      this.startSequence(contactId, 'maklerplan_outreach');
    } else if (source === SOURCES.MAKLERPLAN_CAMPAIGN) {
      this.startSequence(contactId, 'maklerplan_neujahr');
    }
  }

  /**
   * Trigger bei No-Show
   */
  async onNoShow(contactId, meetingId) {
    const contact = unifiedContactService.getContact(contactId);
    if (!contact || contact.activeSequence) return;

    this.startSequence(contactId, 'no_show_recovery');
  }

  // ============================================
  // STATISTICS
  // ============================================

  getSequenceStats() {
    const sequences = Object.values(this.activeSequences);
    
    return {
      total: sequences.length,
      active: sequences.filter(s => s.status === 'active').length,
      completed: sequences.filter(s => s.status === 'completed').length,
      stopped: sequences.filter(s => s.status === 'stopped').length,
      bySequence: Object.keys(SEQUENCE_TEMPLATES).reduce((acc, id) => {
        acc[id] = sequences.filter(s => s.sequenceId === id).length;
        return acc;
      }, {})
    };
  }

  getPipelineStats() {
    return unifiedContactService.getPipelineStats();
  }
}

export const pipelineService = new PipelineService();
