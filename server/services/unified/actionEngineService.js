/**
 * Action Engine Service
 * One-Click Actions: Empfehlung → Alles automatisch
 * 
 * Features:
 * - Learning/Feedback System
 * - Termin-Vorschläge (2-3 Slots) senden
 * - After-Sales Meeting + Recording
 * - Follow-Up E-Mails
 * - Task-Delegation (Zendesk)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { zoomApi } from '../zoomAuth.js';
import { emailService } from '../emailService.js';
import { zendeskService } from '../zendeskService.js';
import { twilioService } from '../twilioService.js';
import { unifiedContactService, STAGES } from './unifiedContactService.js';
import { brandingService } from './brandingService.js';
import { communicationService } from './communicationService.js';
import { callManagerService } from './callManagerService.js';
import logger from '../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LEARNING_PATH = path.join(__dirname, '../../data/call-learning.json');
const ACTIONS_PATH = path.join(__dirname, '../../data/action-history.json');

// Standard Scoring Gewichte (werden durch Learning angepasst)
const DEFAULT_WEIGHTS = {
  hot_lead: 90,
  ticket_urgent: 100,
  ticket_waiting: 80,
  no_show: 85,
  proposal_sent: 75,
  email_replied: 70,
  meeting_followup: 60,
  inactive_customer: 40,
  reactivation: 30
};

class ActionEngineService {

  constructor() {
    this.learningData = this.loadLearning();
    this.actionHistory = this.loadActions();
  }

  loadLearning() {
    try {
      if (fs.existsSync(LEARNING_PATH)) {
        return JSON.parse(fs.readFileSync(LEARNING_PATH, 'utf8'));
      }
    } catch (error) {
      logger.error('Learning Daten laden Fehler', { error: error.message });
    }
    return {
      weights: { ...DEFAULT_WEIGHTS },
      feedback: [],
      stats: { total: 0, successful: 0, unsuccessful: 0 }
    };
  }

  loadActions() {
    try {
      if (fs.existsSync(ACTIONS_PATH)) {
        return JSON.parse(fs.readFileSync(ACTIONS_PATH, 'utf8'));
      }
    } catch (error) {
      logger.error('Actions laden Fehler', { error: error.message });
    }
    return [];
  }

  saveLearning() {
    fs.writeFileSync(LEARNING_PATH, JSON.stringify(this.learningData, null, 2));
  }

  saveActions() {
    fs.writeFileSync(ACTIONS_PATH, JSON.stringify(this.actionHistory.slice(-1000), null, 2));
  }

  // ============================================
  // LEARNING SYSTEM
  // ============================================

  /**
   * Aktuelle Gewichte abrufen (mit Learning-Anpassungen)
   */
  getWeights() {
    return this.learningData.weights;
  }

  /**
   * Gewicht manuell anpassen
   */
  setWeight(reason, weight) {
    this.learningData.weights[reason] = weight;
    this.saveLearning();
    logger.info('Weight updated', { reason, weight });
  }

  /**
   * Feedback für eine Empfehlung geben
   */
  submitFeedback(feedbackData) {
    const {
      contactId,
      recommendationId,
      reason,          // Der Grund der Empfehlung
      outcome,         // 'successful', 'no_answer', 'not_interested', 'wrong_timing', 'wrong_contact'
      notes,
      calledBy,
      callDuration
    } = feedbackData;

    const feedback = {
      id: `fb_${Date.now()}`,
      contactId,
      recommendationId,
      reason,
      outcome,
      notes,
      calledBy,
      callDuration,
      timestamp: new Date().toISOString()
    };

    this.learningData.feedback.push(feedback);
    this.learningData.stats.total++;

    // Learning: Gewichte anpassen basierend auf Feedback
    if (outcome === 'successful') {
      this.learningData.stats.successful++;
      // Gewicht erhöhen (max 100)
      this.learningData.weights[reason] = Math.min(100, (this.learningData.weights[reason] || 50) + 2);
    } else if (outcome === 'wrong_contact' || outcome === 'not_interested') {
      this.learningData.stats.unsuccessful++;
      // Gewicht senken (min 10)
      this.learningData.weights[reason] = Math.max(10, (this.learningData.weights[reason] || 50) - 3);
    }

    this.saveLearning();

    // Interaction loggen
    unifiedContactService.addInteraction(contactId, {
      type: 'call_feedback',
      channel: 'phone',
      direction: 'outbound',
      data: { outcome, reason, duration: callDuration, notes }
    });

    logger.info('Feedback submitted', { contactId, reason, outcome });
    return feedback;
  }

  /**
   * Learning-Statistiken
   */
  getLearningStats() {
    const successRate = this.learningData.stats.total > 0 
      ? (this.learningData.stats.successful / this.learningData.stats.total * 100).toFixed(1)
      : 0;

    return {
      weights: this.learningData.weights,
      stats: {
        ...this.learningData.stats,
        successRate: `${successRate}%`
      },
      recentFeedback: this.learningData.feedback.slice(-20)
    };
  }

  // ============================================
  // ONE-CLICK ACTIONS
  // ============================================

  /**
   * ONE-CLICK: Termin-Einladung mit 2-3 Vorschlägen senden
   */
  async sendMeetingProposal(contactId, options = {}) {
    const contact = unifiedContactService.getContact(contactId);
    if (!contact) throw new Error('Contact not found');

    const brand = brandingService.getBrand(contact.activeBrand);
    const hostId = options.hostId || 'me';

    // 2-3 Terminvorschläge generieren (nächste Werktage, 10:00, 14:00, 16:00)
    const slots = this.generateTimeSlots(3);

    // E-Mail mit Terminvorschlägen
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <h1 style="color: ${brand.colors.primary};">📅 Terminvorschläge für Sie</h1>
        
        <p>Hallo ${contact.firstName || 'there'},</p>
        
        <p>gerne würde ich mit Ihnen sprechen. Hier sind meine Terminvorschläge:</p>
        
        <div style="margin: 20px 0;">
          ${slots.map((slot, i) => `
            <div style="background: ${i === 0 ? '#f0fdf4' : '#f8f9fa'}; padding: 15px; border-radius: 8px; margin: 10px 0; border-left: 4px solid ${i === 0 ? '#22c55e' : '#e5e7eb'};">
              <strong>Option ${i + 1}:</strong> ${slot.display}
              <br>
              <a href="${this.getBookingLink(contact, slot, brand)}" style="color: ${brand.colors.primary}; font-weight: bold;">
                ✅ Diesen Termin wählen
              </a>
            </div>
          `).join('')}
        </div>
        
        <p>Keiner der Termine passt? Antworten Sie einfach mit Ihrem Wunschtermin.</p>
        
        <p style="margin-top: 30px;">
          Freundliche Grüße,<br>
          <strong>Ihr ${brand.name} Team</strong>
        </p>
      </div>
    `;

    await communicationService.sendEmail(contactId, {
      subject: `📅 Terminvorschläge für unser Gespräch`,
      html,
      brand: brand.id
    });

    // Stage updaten
    unifiedContactService.updateStage(contactId, STAGES.PROSPECT, 'Meeting proposal sent');

    // Action loggen
    this.logAction(contactId, 'meeting_proposal', { slots });

    logger.info('Meeting proposal sent', { contactId, slots: slots.length });
    return { success: true, slots };
  }

  /**
   * ONE-CLICK: Nach Anruf - Alles automatisch auslösen
   */
  async executePostCallActions(contactId, callResult) {
    const contact = unifiedContactService.getContact(contactId);
    if (!contact) throw new Error('Contact not found');

    const brand = brandingService.getBrand(contact.activeBrand);
    const results = {
      contactId,
      timestamp: new Date().toISOString(),
      actions: []
    };

    // 1. Anruf loggen
    await communicationService.logPhoneCall(contactId, {
      duration: callResult.duration,
      outcome: callResult.outcome,
      notes: callResult.notes,
      calledBy: callResult.calledBy,
      direction: 'outbound'
    });
    results.actions.push('call_logged');

    // Basierend auf Ergebnis verschiedene Aktionen
    if (callResult.outcome === 'meeting_scheduled') {
      // 2. Meeting erstellen mit Auto-Recording
      const meetingDate = new Date(callResult.meetingDate || this.getNextSlot().date);
      
      const meeting = await zoomApi('POST', `/users/${callResult.hostId || 'me'}/meetings`, {
        topic: `${brand.name} - ${contact.company || contact.firstName}`,
        type: 2,
        start_time: meetingDate.toISOString(),
        duration: callResult.duration || 30,
        timezone: 'Europe/Berlin',
        settings: {
          host_video: true,
          participant_video: true,
          auto_recording: 'cloud', // Automatische Aufzeichnung!
          join_before_host: false
        }
      });
      results.actions.push('meeting_created');
      results.meeting = meeting;

      // 3. Meeting-Einladung senden
      await communicationService.sendMeetingInvitation(contactId, {
        topic: meeting.topic,
        startTime: meeting.start_time,
        duration: meeting.duration,
        joinUrl: meeting.join_url
      });
      results.actions.push('invitation_sent');

      // 4. After-Sales Meeting planen (7 Tage nach dem Meeting)
      const afterSalesDate = new Date(meetingDate);
      afterSalesDate.setDate(afterSalesDate.getDate() + 7);
      
      const afterSales = await zoomApi('POST', `/users/${callResult.hostId || 'me'}/meetings`, {
        topic: `Follow-Up: ${contact.company || contact.firstName}`,
        type: 2,
        start_time: afterSalesDate.toISOString(),
        duration: 15,
        timezone: 'Europe/Berlin',
        settings: { auto_recording: 'cloud' }
      });
      results.actions.push('after_sales_scheduled');
      results.afterSalesMeeting = afterSales;

      // 5. Stage updaten
      unifiedContactService.updateStage(contactId, STAGES.MEETING_SCHEDULED, 'Meeting scheduled via call');

    } else if (callResult.outcome === 'callback_requested') {
      // Rückruf-Task erstellen
      await zendeskService.createTicket({
        subject: `📞 Rückruf: ${contact.company || contact.firstName} ${contact.lastName}`,
        description: `
          <h2>Rückruf gewünscht</h2>
          <p><strong>Wann:</strong> ${callResult.callbackTime || 'So bald wie möglich'}</p>
          <p><strong>Telefon:</strong> ${contact.phone || contact.mobile}</p>
          <p><strong>Notizen:</strong> ${callResult.notes || '-'}</p>
        `,
        priority: 'high',
        type: 'task',
        tags: ['callback', 'phone'],
        requesterEmail: contact.email
      });
      results.actions.push('callback_task_created');

    } else if (callResult.outcome === 'interested') {
      // Follow-Up E-Mail mit mehr Infos
      await this.sendFollowUpEmail(contactId, 'interest');
      results.actions.push('followup_sent');
      
      unifiedContactService.updateStage(contactId, STAGES.CONTACTED, 'Interested via call');

    } else if (callResult.outcome === 'not_interested') {
      // Opt-Out oder Lost markieren
      unifiedContactService.updateStage(contactId, STAGES.LOST, 'Not interested via call');
      results.actions.push('marked_lost');
    }

    // 6. Task-Delegation wenn Aufgaben besprochen wurden
    if (callResult.tasks && callResult.tasks.length > 0) {
      for (const task of callResult.tasks) {
        await zendeskService.createTicket({
          subject: `📋 Aufgabe: ${task.title}`,
          description: `
            <h2>Besprochene Aufgabe</h2>
            <p><strong>Aus Gespräch mit:</strong> ${contact.company || contact.firstName}</p>
            <p><strong>Aufgabe:</strong> ${task.title}</p>
            <p><strong>Details:</strong> ${task.description || '-'}</p>
            <p><strong>Fällig:</strong> ${task.dueDate || 'ASAP'}</p>
            <p><strong>Zugewiesen an:</strong> ${task.assignee || 'Team'}</p>
          `,
          priority: task.priority || 'normal',
          type: 'task',
          tags: ['call-task', 'delegation'],
          requesterEmail: contact.email
        });
      }
      results.actions.push(`${callResult.tasks.length}_tasks_delegated`);
    }

    // Action History speichern
    this.logAction(contactId, 'post_call', results);

    logger.info('Post-call actions executed', { contactId, actions: results.actions });
    return results;
  }

  /**
   * Follow-Up E-Mail basierend auf Typ
   */
  async sendFollowUpEmail(contactId, type) {
    const contact = unifiedContactService.getContact(contactId);
    const brand = brandingService.getBrand(contact.activeBrand);

    const templates = {
      interest: {
        subject: `Ihre Informationen, ${contact.firstName}`,
        html: `
          <h1>Danke für das Gespräch!</h1>
          <p>Wie besprochen, hier die wichtigsten Informationen:</p>
          <ul>
            <li>Unsere Lösung für Sie</li>
            <li>Nächste Schritte</li>
            <li>Kontaktmöglichkeiten</li>
          </ul>
          <p>Bei Fragen - einfach antworten!</p>
        `
      },
      voicemail: {
        subject: `Ich habe Sie nicht erreicht, ${contact.firstName}`,
        html: `
          <h1>Schade, dass ich Sie nicht erreichen konnte!</h1>
          <p>Ich habe versucht Sie anzurufen, aber Sie waren nicht erreichbar.</p>
          <p>Wann passt es Ihnen am besten?</p>
          ${brandingService.getButton(brand.id, '📅 Termin vorschlagen', brand.bookingUrl)}
        `
      }
    };

    const template = templates[type] || templates.interest;

    await communicationService.sendEmail(contactId, {
      subject: template.subject,
      html: template.html,
      brand: brand.id
    });
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  generateTimeSlots(count = 3) {
    const slots = [];
    const now = new Date();
    let currentDay = new Date(now);
    currentDay.setDate(currentDay.getDate() + 1); // Start morgen

    const times = ['10:00', '14:00', '16:00'];
    let timeIndex = 0;

    while (slots.length < count) {
      // Wochenende überspringen
      if (currentDay.getDay() === 0) currentDay.setDate(currentDay.getDate() + 1);
      if (currentDay.getDay() === 6) currentDay.setDate(currentDay.getDate() + 2);

      const [hours, minutes] = times[timeIndex].split(':');
      const slotDate = new Date(currentDay);
      slotDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      slots.push({
        date: slotDate.toISOString(),
        display: `${slotDate.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })} um ${times[timeIndex]} Uhr`,
        time: times[timeIndex]
      });

      timeIndex++;
      if (timeIndex >= times.length) {
        timeIndex = 0;
        currentDay.setDate(currentDay.getDate() + 1);
      }
    }

    return slots;
  }

  getNextSlot() {
    return this.generateTimeSlots(1)[0];
  }

  getBookingLink(contact, slot, brand) {
    // Tracking URL für Slot-Auswahl
    const baseUrl = process.env.PUBLIC_URL || 'http://localhost:3001';
    return `${baseUrl}/api/unified/book-slot?contactId=${contact.id}&date=${encodeURIComponent(slot.date)}&brand=${brand.id}`;
  }

  logAction(contactId, type, data) {
    this.actionHistory.push({
      id: `action_${Date.now()}`,
      contactId,
      type,
      data,
      timestamp: new Date().toISOString()
    });
    this.saveActions();
  }

  getActionHistory(contactId, limit = 20) {
    return this.actionHistory
      .filter(a => !contactId || a.contactId === contactId)
      .slice(-limit);
  }

  // ============================================
  // ONE-CLICK ANRUF MIT TWILIO
  // ============================================

  /**
   * Komplette Empfehlung mit One-Click Button
   * Gibt Analyse + ausführbare Aktionen zurück
   */
  async getRecommendationWithActions(contactId) {
    const analysis = await callManagerService.analyzeContact(contactId);
    if (!analysis || analysis.callPriority === 'none') {
      return null;
    }

    const contact = analysis.contact;
    const brand = brandingService.getBrand(contact.activeBrand);

    return {
      contactId,
      name: `${contact.firstName} ${contact.lastName}`,
      company: contact.company,
      phone: contact.mobile || contact.phone,
      email: contact.email,
      brand: brand.name,
      brandColors: brand.colors,
      
      // Analyse
      priority: analysis.callPriority,
      score: analysis.score,
      recommendation: analysis.recommendation,
      reasons: analysis.reasons.map(r => callManagerService.getReasonText(r)),
      bestTime: analysis.bestTimeToCall,
      lastContact: analysis.lastContact,

      // One-Click Actions
      actions: {
        call: {
          label: '📞 Jetzt anrufen',
          description: 'Startet Anruf über Twilio',
          endpoint: `/api/unified/action/call/${contactId}`
        },
        smsFirst: {
          label: '💬 SMS + Anrufen',
          description: 'SMS senden, dann anrufen',
          endpoint: `/api/unified/action/sms-then-call/${contactId}`
        },
        sendProposal: {
          label: '📅 Terminvorschlag senden',
          description: 'E-Mail mit 3 Terminoptionen',
          endpoint: `/api/unified/action/meeting-proposal/${contactId}`
        },
        createTask: {
          label: '📋 Zendesk Aufgabe',
          description: 'Anruf-Task in Zendesk',
          endpoint: `/api/unified/action/create-task/${contactId}`
        },
        skip: {
          label: '⏭️ Überspringen',
          description: 'Nächste Empfehlung anzeigen',
          endpoint: `/api/unified/action/skip/${contactId}`
        }
      }
    };
  }

  /**
   * ONE-CLICK: Anruf starten über Twilio
   */
  async initiateCall(contactId, agentPhone) {
    const contact = unifiedContactService.getContact(contactId);
    if (!contact) throw new Error('Contact not found');

    const phone = contact.mobile || contact.phone;
    if (!phone) throw new Error('No phone number');

    // Anruf über Twilio initiieren
    const callResult = await twilioService.initiateCall(phone, agentPhone);

    if (callResult.success) {
      // Interaction loggen
      unifiedContactService.addInteraction(contactId, {
        type: 'call_initiated',
        channel: 'phone',
        direction: 'outbound',
        data: { callSid: callResult.callSid, to: phone }
      });

      this.logAction(contactId, 'call_initiated', { callSid: callResult.callSid });

      logger.info('📞 Anruf gestartet', { contactId, phone, callSid: callResult.callSid });
    }

    return callResult;
  }

  /**
   * ONE-CLICK: SMS senden, dann anrufen
   */
  async smsThenCall(contactId, agentPhone) {
    const contact = unifiedContactService.getContact(contactId);
    if (!contact) throw new Error('Contact not found');

    const phone = contact.mobile || contact.phone;
    const brand = brandingService.getBrand(contact.activeBrand);

    // 1. SMS senden
    const smsText = `Hallo ${contact.firstName}, hier ist ${brand.name}. Ich rufe Sie gleich kurz an. Passt es gerade?`;
    
    const smsResult = await twilioService.sendSMS(phone, smsText);
    
    this.logAction(contactId, 'sms_before_call', { message: smsText });

    // 2. Nach 30 Sekunden anrufen (oder sofort wenn Agent will)
    const callResult = await twilioService.initiateCall(phone, agentPhone);

    unifiedContactService.addInteraction(contactId, {
      type: 'sms_then_call',
      channel: 'phone',
      data: { smsSid: smsResult.sid, callSid: callResult.callSid }
    });

    return {
      sms: smsResult,
      call: callResult
    };
  }

  /**
   * Top Empfehlungen für Dashboard abrufen
   */
  async getTopRecommendations(limit = 5) {
    const callList = await callManagerService.generateCallList({ limit, minPriority: 'medium' });
    
    const recommendations = [];
    for (const call of callList.calls) {
      const rec = await this.getRecommendationWithActions(call.contactId);
      if (rec) recommendations.push(rec);
    }

    return {
      date: new Date().toISOString(),
      count: recommendations.length,
      recommendations
    };
  }

  /**
   * Feedback nach Anruf erfassen (für Learning)
   */
  async recordCallOutcome(contactId, outcome) {
    const { result, duration, notes, nextAction } = outcome;

    // Feedback an Learning System
    const contact = unifiedContactService.getContact(contactId);
    const analysis = await callManagerService.analyzeContact(contactId);
    
    if (analysis && analysis.reasons.length > 0) {
      // Hauptgrund für Empfehlung
      const mainReason = analysis.reasons[0].reason;
      
      this.submitFeedback({
        contactId,
        reason: mainReason,
        outcome: result, // 'successful', 'no_answer', 'not_interested', etc.
        notes,
        callDuration: duration
      });
    }

    // Stage basierend auf Ergebnis updaten
    const stageMap = {
      'meeting_scheduled': STAGES.MEETING_SCHEDULED,
      'interested': STAGES.CONTACTED,
      'callback': STAGES.CONTACTED,
      'not_interested': STAGES.LOST,
      'no_answer': null // Stage bleibt
    };

    if (stageMap[result]) {
      unifiedContactService.updateStage(contactId, stageMap[result], `Call outcome: ${result}`);
    }

    // Next Action ausführen wenn angegeben
    if (nextAction === 'send_proposal') {
      await this.sendMeetingProposal(contactId);
    } else if (nextAction === 'create_callback') {
      await zendeskService.createTicket({
        subject: `📞 Rückruf: ${contact.company || contact.firstName}`,
        description: `Rückruf vereinbart.\nNotizen: ${notes || '-'}`,
        priority: 'high',
        type: 'task',
        requesterEmail: contact.email
      });
    }

    this.logAction(contactId, 'call_outcome', outcome);

    return { success: true, outcome };
  }
}

export const actionEngineService = new ActionEngineService();
