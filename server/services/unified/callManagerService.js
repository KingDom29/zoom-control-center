/**
 * Call Manager Service
 * Intelligente Analyse: WER sollte WANN angerufen werden und WARUM?
 * 
 * Datenquellen:
 * - Zendesk: Tickets, letzte Interaktion, offene Anfragen
 * - Azure: E-Mail Aktivität
 * - Zoom: Meetings, No-Shows
 * - Unified Contacts: Pipeline Stage
 */

import { zendeskService } from '../zendeskService.js';
import { unifiedContactService, STAGES } from './unifiedContactService.js';
import { brandingService } from './brandingService.js';
import logger from '../../utils/logger.js';

// Prioritäts-Level
export const PRIORITY = {
  URGENT: 'urgent',      // Sofort anrufen
  HIGH: 'high',          // Heute anrufen
  MEDIUM: 'medium',      // Diese Woche
  LOW: 'low',            // Wenn Zeit
  NONE: 'none'           // Kein Anruf nötig
};

// Gründe für Anruf
export const CALL_REASONS = {
  HOT_LEAD: 'hot_lead',                    // Hat auf CTA geklickt
  TICKET_URGENT: 'ticket_urgent',          // Dringendes Ticket offen
  TICKET_WAITING: 'ticket_waiting',        // Ticket wartet auf Antwort
  NO_SHOW: 'no_show',                      // Meeting verpasst
  MEETING_FOLLOWUP: 'meeting_followup',    // Nach Meeting
  PROPOSAL_SENT: 'proposal_sent',          // Angebot gesendet, keine Antwort
  INACTIVE_CUSTOMER: 'inactive_customer',  // Kunde lange inaktiv
  REACTIVATION: 'reactivation',            // Win-Back Kandidat
  EMAIL_REPLIED: 'email_replied',          // Hat auf E-Mail geantwortet
  SCHEDULED_CALLBACK: 'scheduled_callback' // Geplanter Rückruf
};

class CallManagerService {

  /**
   * Analysiert einen Kontakt und berechnet Anruf-Priorität
   */
  async analyzeContact(contactId) {
    const contact = unifiedContactService.getContact(contactId);
    if (!contact) return null;
    if (!contact.phone && !contact.mobile) return { ...contact, callPriority: PRIORITY.NONE, reason: 'no_phone' };

    const analysis = {
      contact,
      phone: contact.mobile || contact.phone,
      brand: brandingService.getBrand(contact.activeBrand),
      callPriority: PRIORITY.NONE,
      reasons: [],
      score: 0,
      recommendation: '',
      bestTimeToCall: null,
      lastContact: null,
      zendeskData: null
    };

    // 1. Zendesk Analyse
    try {
      const zendeskActivity = await zendeskService.getRealCustomerActivity(contact.email, 30);
      analysis.zendeskData = zendeskActivity;
      analysis.lastContact = zendeskActivity.lastRealContact;

      // Offene dringende Tickets?
      if (zendeskActivity.activities?.some(a => a.ticketSubject?.includes('URGENT') || a.ticketSubject?.includes('DRINGEND'))) {
        analysis.reasons.push({ reason: CALL_REASONS.TICKET_URGENT, weight: 100 });
        analysis.score += 100;
      }

      // Ticket wartet auf Antwort?
      if (zendeskActivity.activities?.some(a => a.isFromCustomer && this.isRecent(a.date, 2))) {
        analysis.reasons.push({ reason: CALL_REASONS.TICKET_WAITING, weight: 80 });
        analysis.score += 80;
      }

      // Kunde hat geantwortet (E-Mail)?
      if (zendeskActivity.activities?.some(a => a.type === 'email' && a.isFromCustomer && this.isRecent(a.date, 1))) {
        analysis.reasons.push({ reason: CALL_REASONS.EMAIL_REPLIED, weight: 70 });
        analysis.score += 70;
      }

      // Lange inaktiv?
      if (contact.stage === STAGES.ACTIVE || contact.stage === STAGES.CUSTOMER) {
        if (zendeskActivity.daysSinceLastContact > 30) {
          analysis.reasons.push({ reason: CALL_REASONS.INACTIVE_CUSTOMER, weight: 40, days: zendeskActivity.daysSinceLastContact });
          analysis.score += 40;
        }
      }
    } catch (error) {
      logger.warn('Zendesk Analyse fehlgeschlagen', { contactId, error: error.message });
    }

    // 2. Pipeline Stage Analyse
    switch (contact.stage) {
      case STAGES.CONTACTED:
        // Hat reagiert aber noch kein Meeting
        if (contact.emailsClicked > 0) {
          analysis.reasons.push({ reason: CALL_REASONS.HOT_LEAD, weight: 90 });
          analysis.score += 90;
        }
        break;

      case STAGES.MEETING_DONE:
        // Meeting war, Follow-Up nötig
        const daysSinceMeeting = contact.lastMeetingAt 
          ? Math.floor((Date.now() - new Date(contact.lastMeetingAt)) / (1000 * 60 * 60 * 24))
          : null;
        if (daysSinceMeeting !== null && daysSinceMeeting >= 2 && daysSinceMeeting <= 7) {
          analysis.reasons.push({ reason: CALL_REASONS.MEETING_FOLLOWUP, weight: 60, daysSince: daysSinceMeeting });
          analysis.score += 60;
        }
        break;

      case STAGES.PROPOSAL_SENT:
        // Angebot gesendet, keine Antwort
        analysis.reasons.push({ reason: CALL_REASONS.PROPOSAL_SENT, weight: 75 });
        analysis.score += 75;
        break;

      case STAGES.CHURNED:
      case STAGES.LOST:
        // Win-Back Kandidat?
        if (contact.lastContactAt) {
          const daysSince = Math.floor((Date.now() - new Date(contact.lastContactAt)) / (1000 * 60 * 60 * 24));
          if (daysSince > 60 && daysSince < 180) {
            analysis.reasons.push({ reason: CALL_REASONS.REACTIVATION, weight: 30, daysSince });
            analysis.score += 30;
          }
        }
        break;
    }

    // 3. No-Show Check
    const interactions = unifiedContactService.getInteractions(contactId, 10);
    const recentNoShow = interactions.find(i => 
      i.type === 'meeting_scheduled' && 
      !interactions.find(j => j.type === 'meeting_completed' && j.data?.meetingId === i.data?.meetingId) &&
      this.isRecent(i.timestamp, 3)
    );
    if (recentNoShow) {
      analysis.reasons.push({ reason: CALL_REASONS.NO_SHOW, weight: 85 });
      analysis.score += 85;
    }

    // 4. Priorität berechnen
    if (analysis.score >= 90) {
      analysis.callPriority = PRIORITY.URGENT;
      analysis.recommendation = '🔥 SOFORT anrufen!';
    } else if (analysis.score >= 60) {
      analysis.callPriority = PRIORITY.HIGH;
      analysis.recommendation = '📞 Heute anrufen';
    } else if (analysis.score >= 30) {
      analysis.callPriority = PRIORITY.MEDIUM;
      analysis.recommendation = '📅 Diese Woche anrufen';
    } else if (analysis.score > 0) {
      analysis.callPriority = PRIORITY.LOW;
      analysis.recommendation = '💭 Wenn Zeit ist';
    } else {
      analysis.callPriority = PRIORITY.NONE;
      analysis.recommendation = 'Kein Anruf nötig';
    }

    // 5. Beste Anrufzeit (Business Hours)
    analysis.bestTimeToCall = this.getBestCallTime(contact);

    return analysis;
  }

  /**
   * Generiert die tägliche Anruf-Liste
   */
  async generateCallList(options = {}) {
    const { limit = 20, brand, minPriority = PRIORITY.LOW } = options;

    // Alle Kontakte mit Telefon
    const contacts = unifiedContactService.findContacts({ hasPhone: true, optedOut: false }).contacts;
    
    const analyses = [];
    
    for (const contact of contacts) {
      if (brand && contact.activeBrand !== brand) continue;
      
      const analysis = await this.analyzeContact(contact.id);
      if (!analysis) continue;
      
      // Prioritäts-Filter
      const priorityOrder = [PRIORITY.URGENT, PRIORITY.HIGH, PRIORITY.MEDIUM, PRIORITY.LOW, PRIORITY.NONE];
      const minIndex = priorityOrder.indexOf(minPriority);
      const currentIndex = priorityOrder.indexOf(analysis.callPriority);
      
      if (currentIndex <= minIndex && analysis.callPriority !== PRIORITY.NONE) {
        analyses.push(analysis);
      }
    }

    // Nach Score sortieren
    analyses.sort((a, b) => b.score - a.score);

    return {
      date: new Date().toISOString().split('T')[0],
      totalAnalyzed: contacts.length,
      callsRecommended: analyses.length,
      calls: analyses.slice(0, limit).map(a => ({
        contactId: a.contact.id,
        name: `${a.contact.firstName} ${a.contact.lastName}`,
        company: a.contact.company,
        phone: a.phone,
        email: a.contact.email,
        brand: a.brand.name,
        stage: a.contact.stage,
        priority: a.callPriority,
        score: a.score,
        reasons: a.reasons.map(r => this.getReasonText(r)),
        recommendation: a.recommendation,
        bestTime: a.bestTimeToCall,
        lastContact: a.lastContact
      }))
    };
  }

  /**
   * Erstellt Zendesk Tickets für Anrufe
   */
  async createCallTasks(callList) {
    const created = [];

    for (const call of callList.calls) {
      if (call.priority === PRIORITY.URGENT || call.priority === PRIORITY.HIGH) {
        try {
          await zendeskService.createTicket({
            subject: `📞 ${call.priority === PRIORITY.URGENT ? '🔥 URGENT: ' : ''}Anruf: ${call.company || call.name}`,
            description: `
              <h2>Anruf-Empfehlung</h2>
              <table>
                <tr><td><strong>Kontakt:</strong></td><td>${call.name}</td></tr>
                <tr><td><strong>Firma:</strong></td><td>${call.company || '-'}</td></tr>
                <tr><td><strong>Telefon:</strong></td><td><a href="tel:${call.phone}">${call.phone}</a></td></tr>
                <tr><td><strong>E-Mail:</strong></td><td>${call.email}</td></tr>
                <tr><td><strong>Brand:</strong></td><td>${call.brand}</td></tr>
                <tr><td><strong>Stage:</strong></td><td>${call.stage}</td></tr>
                <tr><td><strong>Priorität:</strong></td><td>${call.priority} (Score: ${call.score})</td></tr>
              </table>
              
              <h3>Gründe für Anruf:</h3>
              <ul>
                ${call.reasons.map(r => `<li>${r}</li>`).join('')}
              </ul>
              
              <p><strong>Empfehlung:</strong> ${call.recommendation}</p>
              <p><strong>Beste Zeit:</strong> ${call.bestTime}</p>
            `,
            priority: call.priority === PRIORITY.URGENT ? 'urgent' : 'high',
            type: 'task',
            tags: ['call-manager', 'auto-generated', call.priority],
            requesterEmail: call.email,
            requesterName: call.name
          });
          created.push(call.contactId);
        } catch (error) {
          logger.error('Call Task erstellen fehlgeschlagen', { contactId: call.contactId, error: error.message });
        }
      }
    }

    return { created: created.length, contactIds: created };
  }

  /**
   * SMS über Zendesk senden (als interner Kommentar + Notiz)
   */
  async sendSmsViaZendesk(contactId, message) {
    const contact = unifiedContactService.getContact(contactId);
    if (!contact) throw new Error('Contact not found');

    const phone = contact.mobile || contact.phone;
    if (!phone) throw new Error('No phone number');

    // Zendesk Ticket für SMS-Versand
    const ticket = await zendeskService.createTicket({
      subject: `📱 SMS an ${contact.company || contact.firstName}: "${message.substring(0, 30)}..."`,
      description: `
        <h2>SMS Versand</h2>
        <p><strong>An:</strong> ${phone}</p>
        <p><strong>Nachricht:</strong></p>
        <blockquote style="background: #f0f9ff; padding: 15px; border-left: 4px solid #1a73e8;">
          ${message}
        </blockquote>
        <p style="color: #666; font-size: 12px;">
          ⚠️ SMS muss manuell gesendet werden oder über SMS-Gateway automatisiert.
        </p>
      `,
      priority: 'normal',
      type: 'task',
      tags: ['sms', 'outbound'],
      requesterEmail: contact.email,
      requesterName: `${contact.firstName} ${contact.lastName}`
    });

    // Interaction loggen
    unifiedContactService.addInteraction(contactId, {
      type: 'sms_queued',
      channel: 'sms',
      brand: contact.activeBrand,
      direction: 'outbound',
      data: { message, phone, zendeskTicketId: ticket?.id }
    });

    logger.info('SMS via Zendesk queued', { contactId, phone, ticketId: ticket?.id });
    return { success: true, ticketId: ticket?.id, phone, message };
  }

  /**
   * WhatsApp über Zendesk senden
   */
  async sendWhatsAppViaZendesk(contactId, message) {
    const contact = unifiedContactService.getContact(contactId);
    if (!contact) throw new Error('Contact not found');

    const phone = contact.mobile || contact.phone;
    if (!phone) throw new Error('No phone number');

    // WhatsApp Link generieren
    const cleanPhone = phone.replace(/[^0-9+]/g, '').replace(/^\+/, '');
    const waLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;

    const ticket = await zendeskService.createTicket({
      subject: `💬 WhatsApp an ${contact.company || contact.firstName}`,
      description: `
        <h2>WhatsApp Nachricht</h2>
        <p><strong>An:</strong> ${phone}</p>
        <p><strong>Nachricht:</strong></p>
        <blockquote style="background: #dcfce7; padding: 15px; border-left: 4px solid #22c55e;">
          ${message}
        </blockquote>
        <p>
          <a href="${waLink}" style="display: inline-block; background: #25D366; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none;">
            💬 WhatsApp öffnen
          </a>
        </p>
      `,
      priority: 'normal',
      type: 'task',
      tags: ['whatsapp', 'outbound'],
      requesterEmail: contact.email,
      requesterName: `${contact.firstName} ${contact.lastName}`
    });

    unifiedContactService.addInteraction(contactId, {
      type: 'whatsapp_queued',
      channel: 'whatsapp',
      brand: contact.activeBrand,
      direction: 'outbound',
      data: { message, phone, waLink, zendeskTicketId: ticket?.id }
    });

    return { success: true, ticketId: ticket?.id, phone, waLink };
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  isRecent(dateStr, days) {
    if (!dateStr) return false;
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = (now - date) / (1000 * 60 * 60 * 24);
    return diffDays <= days;
  }

  getBestCallTime(contact) {
    // Basierend auf Timezone und Business Hours
    const tz = contact.timezone || 'Europe/Berlin';
    const now = new Date();
    const hour = now.getHours();

    if (hour < 9) return '09:00 - 10:00';
    if (hour < 12) return 'Jetzt (Vormittag)';
    if (hour < 14) return '14:00 - 15:00 (nach Mittagspause)';
    if (hour < 17) return 'Jetzt (Nachmittag)';
    return 'Morgen 09:00 - 10:00';
  }

  getReasonText(reason) {
    const texts = {
      [CALL_REASONS.HOT_LEAD]: '🔥 Hot Lead - Hat auf Link geklickt',
      [CALL_REASONS.TICKET_URGENT]: '🚨 Dringendes Ticket offen',
      [CALL_REASONS.TICKET_WAITING]: '⏳ Ticket wartet auf unsere Antwort',
      [CALL_REASONS.NO_SHOW]: '❌ Meeting verpasst - Reschedule nötig',
      [CALL_REASONS.MEETING_FOLLOWUP]: `📞 Follow-Up nach Meeting (${reason.daysSince || '?'} Tage)`,
      [CALL_REASONS.PROPOSAL_SENT]: '📄 Angebot gesendet - Nachfassen',
      [CALL_REASONS.INACTIVE_CUSTOMER]: `😴 Kunde inaktiv seit ${reason.days || '?'} Tagen`,
      [CALL_REASONS.REACTIVATION]: `🔄 Win-Back Kandidat (${reason.daysSince || '?'} Tage inaktiv)`,
      [CALL_REASONS.EMAIL_REPLIED]: '📧 Hat auf E-Mail geantwortet',
      [CALL_REASONS.SCHEDULED_CALLBACK]: '📅 Geplanter Rückruf'
    };
    return texts[reason.reason] || reason.reason;
  }
}

export const callManagerService = new CallManagerService();
