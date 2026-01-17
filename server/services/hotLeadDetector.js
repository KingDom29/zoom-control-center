/**
 * Hot Lead Detector Service
 * Parst Inbox auf Urgency-Keywords und benachrichtigt sofort
 */

import { emailService } from './emailService.js';
import { zoomApi } from './zoomAuth.js';
import logger from '../utils/logger.js';

// Urgency Keywords (Deutsch + Englisch)
const URGENCY_KEYWORDS = [
  // Dringend
  'dringend', 'urgent', 'asap', 'sofort', 'schnell', 'eilig',
  // Interesse
  'interesse', 'interessiert', 'möchte', 'will', 'würde gerne',
  // Termin
  'termin', 'meeting', 'gespräch', 'telefonat', 'anruf', 'rückruf',
  // Positiv
  'ja', 'gerne', 'einverstanden', 'zusage', 'dabei',
  // Fragen
  'wie funktioniert', 'mehr infos', 'details', 'konditionen', 'provision'
];

// Negative Keywords (Abmeldung, Absage)
const NEGATIVE_KEYWORDS = [
  'abmelden', 'austragen', 'unsubscribe', 'kein interesse', 
  'absage', 'stornieren', 'abbrechen', 'nicht mehr'
];

class HotLeadDetector {
  constructor() {
    this.lastCheck = null;
    this.hotLeads = [];
  }

  /**
   * Berechnet Urgency Score (0-100)
   */
  calculateUrgencyScore(subject, preview) {
    const text = `${subject} ${preview}`.toLowerCase();
    let score = 0;
    let matchedKeywords = [];

    // Negative Keywords = sofort 0
    for (const keyword of NEGATIVE_KEYWORDS) {
      if (text.includes(keyword)) {
        return { score: 0, matchedKeywords: [keyword], isNegative: true };
      }
    }

    // Urgency Keywords zählen
    for (const keyword of URGENCY_KEYWORDS) {
      if (text.includes(keyword)) {
        score += 15;
        matchedKeywords.push(keyword);
      }
    }

    // Bonus für mehrere Keywords
    if (matchedKeywords.length >= 3) score += 20;
    
    // Bonus für Ausrufezeichen (Enthusiasmus)
    const exclamations = (text.match(/!/g) || []).length;
    score += Math.min(exclamations * 5, 15);

    // Bonus für Fragezeichen (Interesse)
    const questions = (text.match(/\?/g) || []).length;
    score += Math.min(questions * 3, 10);

    return { 
      score: Math.min(score, 100), 
      matchedKeywords,
      isNegative: false
    };
  }

  /**
   * Erstellt Instant-Meeting Link
   */
  async createInstantMeeting(leadName, leadEmail) {
    try {
      // Meeting mit info@maklerplan.ch erstellen (Zoom-User)
      const meeting = await zoomApi('POST', '/users/info@maklerplan.ch/meetings', {
        topic: `🔥 Hot Lead: ${leadName}`,
        type: 1, // Instant meeting
        duration: 30,
        settings: {
          host_video: true,
          participant_video: true,
          join_before_host: false,
          waiting_room: true,
          auto_recording: 'cloud'
        }
      });

      logger.info(`🎥 Instant Meeting erstellt für ${leadEmail}`, { meetingId: meeting.id });

      return {
        meetingId: meeting.id,
        joinUrl: meeting.join_url,
        startUrl: meeting.start_url,
        password: meeting.password
      };
    } catch (error) {
      logger.error('Instant Meeting Fehler', { error: error.message });
      return null;
    }
  }

  /**
   * Scannt Inbox auf Hot Leads
   */
  async scanInbox(options = {}) {
    const { minScore = 30, limit = 50, since = null } = options;

    try {
      // Inbox abrufen (letzte X Nachrichten)
      const messages = await emailService.getInboxMessages({ limit });
      
      const hotLeads = [];
      
      for (const msg of messages) {
        // Score berechnen
        const { score, matchedKeywords, isNegative } = this.calculateUrgencyScore(
          msg.subject || '', 
          msg.preview || ''
        );

        // Nur Hot Leads (Score >= minScore)
        if (score >= minScore && !isNegative) {
          hotLeads.push({
            messageId: msg.id,
            from: msg.from,
            fromName: msg.fromName,
            subject: msg.subject,
            preview: msg.preview,
            receivedAt: msg.receivedAt,
            isRead: msg.isRead,
            urgencyScore: score,
            matchedKeywords,
            priority: score >= 70 ? 'CRITICAL' : score >= 50 ? 'HIGH' : 'MEDIUM'
          });
        }
      }

      // Nach Score sortieren
      hotLeads.sort((a, b) => b.urgencyScore - a.urgencyScore);

      this.hotLeads = hotLeads;
      this.lastCheck = new Date().toISOString();

      logger.info(`🔥 Hot Lead Scan: ${hotLeads.length} gefunden`, {
        total: messages.length,
        hot: hotLeads.length,
        critical: hotLeads.filter(l => l.priority === 'CRITICAL').length
      });

      return {
        scannedAt: this.lastCheck,
        totalMessages: messages.length,
        hotLeads: hotLeads.length,
        leads: hotLeads
      };

    } catch (error) {
      logger.error('Hot Lead Scan Fehler', { error: error.message });
      throw error;
    }
  }

  /**
   * Sendet Notification für Hot Lead
   */
  async notifyHotLead(lead, options = {}) {
    const { createMeeting = true, notifyEmail = 'de@maklerplan.com' } = options;

    const notifications = [];

    // 1. Instant Meeting erstellen (wenn gewünscht)
    let meeting = null;
    if (createMeeting) {
      meeting = await this.createInstantMeeting(lead.fromName || lead.from, lead.from);
    }

    // 2. E-Mail Notification senden
    try {
      const meetingInfo = meeting ? `
        <div style="background: #22c55e; color: white; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <h3 style="margin: 0 0 10px 0;">🎥 Instant Meeting bereit!</h3>
          <p style="margin: 5px 0;"><strong>Meeting starten:</strong></p>
          <a href="${meeting.startUrl}" style="color: white; font-size: 18px;">${meeting.startUrl}</a>
          <p style="margin: 10px 0 5px 0;"><strong>Teilnehmer-Link (für Lead):</strong></p>
          <a href="${meeting.joinUrl}" style="color: white;">${meeting.joinUrl}</a>
          ${meeting.password ? `<p style="margin: 5px 0;"><strong>Passwort:</strong> ${meeting.password}</p>` : ''}
        </div>
      ` : '';

      await emailService.sendEmail({
        to: notifyEmail,
        subject: `🔥 HOT LEAD [${lead.priority}]: ${lead.fromName || lead.from}`,
        body: `
          <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h2 style="color: #ef4444;">🚨 Hot Lead erkannt!</h2>
            
            <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
              <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Von:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${lead.fromName || '-'} &lt;${lead.from}&gt;</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Betreff:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${lead.subject}</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Score:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;"><span style="background: ${lead.priority === 'CRITICAL' ? '#ef4444' : '#f59e0b'}; color: white; padding: 2px 8px; border-radius: 4px;">${lead.urgencyScore}/100 (${lead.priority})</span></td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Keywords:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${lead.matchedKeywords.join(', ')}</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Empfangen:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${new Date(lead.receivedAt).toLocaleString('de-DE')}</td></tr>
            </table>

            <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 15px 0;">
              <strong>Vorschau:</strong><br>
              <em>${lead.preview}</em>
            </div>

            ${meetingInfo}

            <p style="color: #666; font-size: 12px; margin-top: 20px;">
              Maklerplan Hot Lead Detector<br>
              Automatisch generiert am ${new Date().toLocaleString('de-DE')}
            </p>
          </div>
        `
      });

      notifications.push({ type: 'email', status: 'sent', to: notifyEmail });
    } catch (error) {
      notifications.push({ type: 'email', status: 'failed', error: error.message });
    }

    return {
      lead,
      meeting,
      notifications,
      notifiedAt: new Date().toISOString()
    };
  }

  /**
   * Scannt und benachrichtigt automatisch
   */
  async scanAndNotify(options = {}) {
    const { minScore = 50, notifyEmail = 'de@maklerplan.com', createMeeting = true } = options;

    const result = await this.scanInbox({ minScore });
    const notified = [];

    // Nur CRITICAL und HIGH Leads automatisch benachrichtigen
    const urgentLeads = result.leads.filter(l => l.priority === 'CRITICAL' || l.priority === 'HIGH');

    for (const lead of urgentLeads.slice(0, 5)) { // Max 5 Notifications
      const notification = await this.notifyHotLead(lead, { createMeeting, notifyEmail });
      notified.push(notification);
      
      // Rate limiting
      await new Promise(r => setTimeout(r, 2000));
    }

    return {
      scanned: result,
      notified,
      summary: {
        totalScanned: result.totalMessages,
        hotLeadsFound: result.hotLeads,
        notificationsSent: notified.length
      }
    };
  }

  /**
   * Status abrufen
   */
  getStatus() {
    return {
      lastCheck: this.lastCheck,
      hotLeadsCount: this.hotLeads.length,
      criticalCount: this.hotLeads.filter(l => l.priority === 'CRITICAL').length,
      keywords: URGENCY_KEYWORDS.length
    };
  }
}

export const hotLeadDetector = new HotLeadDetector();
export default hotLeadDetector;
