/**
 * Zoom Scheduler Service
 * Erstellt und verwaltet Zoom Scheduler für Terminbuchungen
 */

import { zoomApi } from './zoomAuth.js';
import logger from '../utils/logger.js';

class ZoomSchedulerService {
  constructor() {
    this.userId = 'info@maklerplan.ch'; // Zoom User für Meetings
  }

  /**
   * Scheduler-Link für User abrufen
   */
  async getSchedulerLink() {
    try {
      const user = await zoomApi('GET', `/users/${this.userId}`);
      // Zoom Scheduler Link Format
      return {
        userId: user.id,
        email: user.email,
        schedulerUrl: `https://zoom.us/schedule/${user.id}`,
        personalMeetingUrl: user.personal_meeting_url
      };
    } catch (error) {
      logger.error('Scheduler Link Fehler', { error: error.message });
      throw error;
    }
  }

  /**
   * Erstellt ein geplantes Meeting als "Analyse-Termin"
   * (Zoom Scheduler ist eigentlich ein separates Produkt, 
   * aber wir können Meetings mit Registrierung nutzen)
   */
  async createAnalyseMeeting(options = {}) {
    const {
      topic = '🎯 20-Min Gratis-Analyse - Leadquelle',
      duration = 20,
      agenda = `Kostenlose Analyse Ihres Geschäfts:

✅ Wo Sie aktuell Kunden verlieren
✅ Wie Ihre Konkurrenz es besser macht  
✅ 3 sofort umsetzbare Tipps für mehr Anfragen

Kein Risiko, keine Verpflichtung.

Leadquelle Deutschland
Friedrichstraße 171, 10117 Berlin
leadquelle.ai`
    } = options;

    try {
      const meeting = await zoomApi('POST', `/users/${this.userId}/meetings`, {
        topic,
        type: 2, // Scheduled meeting
        duration,
        timezone: 'Europe/Berlin',
        agenda,
        settings: {
          host_video: true,
          participant_video: true,
          join_before_host: false,
          mute_upon_entry: false,
          waiting_room: true,
          auto_recording: 'cloud',
          registration_type: 1, // Registrierung erforderlich
          approval_type: 0, // Automatisch genehmigen
          close_registration: false,
          show_share_button: true,
          allow_multiple_devices: false,
          registrants_email_notification: true
        }
      });

      logger.info('📅 Analyse-Meeting erstellt', { meetingId: meeting.id });

      return {
        meetingId: meeting.id,
        topic: meeting.topic,
        joinUrl: meeting.join_url,
        startUrl: meeting.start_url,
        registrationUrl: meeting.registration_url,
        password: meeting.password
      };
    } catch (error) {
      logger.error('Meeting erstellen Fehler', { error: error.message });
      throw error;
    }
  }

  /**
   * Erstellt einen wiederkehrenden Meeting-Slot für Buchungen
   */
  async createRecurringAnalyseSlot() {
    try {
      const meeting = await zoomApi('POST', `/users/${this.userId}/meetings`, {
        topic: '🎯 20-Min Gratis-Analyse - Leadquelle',
        type: 8, // Recurring meeting with fixed time
        duration: 20,
        timezone: 'Europe/Berlin',
        recurrence: {
          type: 1, // Daily
          repeat_interval: 1,
          weekly_days: '1,2,3,4,5', // Mo-Fr
          end_times: 365 // Ein Jahr
        },
        settings: {
          host_video: true,
          participant_video: true,
          join_before_host: false,
          waiting_room: true,
          auto_recording: 'cloud',
          registration_type: 2, // Registrierung für jede Occurrence
          approval_type: 0
        },
        agenda: `Kostenlose 20-Minuten Analyse:
        
• Aktuelle Schwachstellen identifizieren
• Konkurrenz-Analyse
• Sofort umsetzbare Tipps

Leadquelle Deutschland | leadquelle.ai`
      });

      logger.info('📅 Recurring Analyse-Slot erstellt', { meetingId: meeting.id });

      return {
        meetingId: meeting.id,
        joinUrl: meeting.join_url,
        registrationUrl: meeting.registration_url
      };
    } catch (error) {
      logger.error('Recurring Slot Fehler', { error: error.message });
      throw error;
    }
  }

  /**
   * Personal Meeting Room Info abrufen
   */
  async getPersonalMeetingRoom() {
    try {
      const user = await zoomApi('GET', `/users/${this.userId}`);
      const settings = await zoomApi('GET', `/users/${this.userId}/settings`);
      
      return {
        pmi: user.pmi, // Personal Meeting ID
        personalMeetingUrl: user.personal_meeting_url,
        usePmi: settings.schedule_meeting?.use_pmi_for_scheduled_meetings,
        waitingRoom: settings.in_meeting?.waiting_room
      };
    } catch (error) {
      logger.error('PMI Fehler', { error: error.message });
      throw error;
    }
  }

  /**
   * Schnell-Meeting für sofortigen Call erstellen
   */
  async createInstantMeeting(leadName) {
    try {
      const meeting = await zoomApi('POST', `/users/${this.userId}/meetings`, {
        topic: `🎯 Analyse: ${leadName} - Leadquelle`,
        type: 1, // Instant
        duration: 20,
        timezone: 'Europe/Berlin',
        settings: {
          host_video: true,
          participant_video: true,
          waiting_room: true,
          auto_recording: 'cloud'
        }
      });

      return {
        meetingId: meeting.id,
        joinUrl: meeting.join_url,
        startUrl: meeting.start_url,
        password: meeting.password
      };
    } catch (error) {
      logger.error('Instant Meeting Fehler', { error: error.message });
      throw error;
    }
  }
}

export const zoomSchedulerService = new ZoomSchedulerService();
export default zoomSchedulerService;
