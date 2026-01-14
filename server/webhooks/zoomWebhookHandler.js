/**
 * Zoom Webhook Handler
 * Verarbeitet eingehende Zoom Events und leitet sie an WebSocket-Clients weiter
 */

import crypto from 'crypto';
import logger from '../utils/logger.js';

export class ZoomWebhookHandler {
  constructor(webhookSecretToken) {
    this.secretToken = webhookSecretToken;
    this.eventHandlers = new Map();
    this.eventHistory = [];
    this.maxHistorySize = 100;
  }

  /**
   * Verifiziert die Webhook-Signatur von Zoom
   */
  verifyWebhookSignature(req) {
    const message = `v0:${req.headers['x-zm-request-timestamp']}:${JSON.stringify(req.body)}`;
    const hashForVerify = crypto
      .createHmac('sha256', this.secretToken)
      .update(message)
      .digest('hex');
    const signature = `v0=${hashForVerify}`;
    return req.headers['x-zm-signature'] === signature;
  }

  /**
   * Generiert Response für Zoom URL Validation
   */
  generateChallengeResponse(plainToken) {
    const encryptedToken = crypto
      .createHmac('sha256', this.secretToken)
      .update(plainToken)
      .digest('hex');
    return {
      plainToken,
      encryptedToken
    };
  }

  /**
   * Registriert einen Event Handler
   */
  on(eventType, handler) {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, []);
    }
    this.eventHandlers.get(eventType).push(handler);
  }

  /**
   * Verarbeitet eingehendes Webhook Event
   */
  async processEvent(event) {
    const { event: eventType, payload, event_ts } = event;
    
    const processedEvent = {
      id: crypto.randomUUID(),
      type: eventType,
      payload,
      timestamp: event_ts || Date.now(),
      receivedAt: new Date().toISOString(),
      processed: false
    };

    // Event zur Historie hinzufügen
    this.eventHistory.unshift(processedEvent);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.pop();
    }

    // Registered Handlers aufrufen
    const handlers = this.eventHandlers.get(eventType) || [];
    const allHandlers = [...handlers, ...(this.eventHandlers.get('*') || [])];

    for (const handler of allHandlers) {
      try {
        await handler(processedEvent);
      } catch (error) {
        logger.error(`Error in handler for ${eventType}`, { error: error.message });
      }
    }

    processedEvent.processed = true;
    return processedEvent;
  }

  /**
   * Gibt die Event-Historie zurück
   */
  getEventHistory(limit = 50, eventType = null) {
    let events = this.eventHistory;
    if (eventType) {
      events = events.filter(e => e.type === eventType);
    }
    return events.slice(0, limit);
  }

  clearEventHistory() {
    this.eventHistory.length = 0;
  }

  /**
   * Formatiert Events für die UI
   */
  static formatEventForUI(event) {
    const { type, payload, timestamp } = event;
    
    const formatters = {
      'meeting.started': () => ({
        title: 'Meeting gestartet',
        message: `"${payload?.object?.topic || 'Unbenanntes Meeting'}" wurde von ${payload?.object?.host?.email || 'Host'} gestartet`,
        icon: '🟢',
        color: 'green',
        meetingId: payload?.object?.id
      }),
      
      'meeting.ended': () => ({
        title: 'Meeting beendet',
        message: `"${payload?.object?.topic || 'Meeting'}" wurde beendet (Dauer: ${Math.round((payload?.object?.duration || 0))} Min.)`,
        icon: '🔴',
        color: 'red',
        meetingId: payload?.object?.id
      }),
      
      'meeting.participant_joined': () => ({
        title: 'Teilnehmer beigetreten',
        message: `${payload?.object?.participant?.user_name || 'Jemand'} ist "${payload?.object?.topic || 'Meeting'}" beigetreten`,
        icon: '👋',
        color: 'blue',
        meetingId: payload?.object?.id
      }),
      
      'meeting.participant_left': () => ({
        title: 'Teilnehmer verlassen',
        message: `${payload?.object?.participant?.user_name || 'Jemand'} hat "${payload?.object?.topic || 'Meeting'}" verlassen`,
        icon: '👋',
        color: 'gray',
        meetingId: payload?.object?.id
      }),

      'meeting.created': () => ({
        title: 'Meeting erstellt',
        message: `"${payload?.object?.topic || 'Neues Meeting'}" wurde geplant`,
        icon: '📅',
        color: 'blue',
        meetingId: payload?.object?.id
      }),

      'meeting.updated': () => ({
        title: 'Meeting aktualisiert',
        message: `"${payload?.object?.topic || 'Meeting'}" wurde geändert`,
        icon: '✏️',
        color: 'blue',
        meetingId: payload?.object?.id
      }),

      'meeting.deleted': () => ({
        title: 'Meeting gelöscht',
        message: `Ein Meeting wurde gelöscht`,
        icon: '🗑️',
        color: 'red',
        meetingId: payload?.object?.id
      }),
      
      'recording.completed': () => ({
        title: 'Aufnahme fertig',
        message: `Aufnahme für "${payload?.object?.topic || 'Meeting'}" ist verfügbar`,
        icon: '🎬',
        color: 'purple',
        meetingId: payload?.object?.id,
        recordingFiles: payload?.object?.recording_files
      }),
      
      'recording.started': () => ({
        title: 'Aufnahme gestartet',
        message: `Aufnahme für "${payload?.object?.topic || 'Meeting'}" wurde gestartet`,
        icon: '⏺️',
        color: 'red',
        meetingId: payload?.object?.id
      }),

      'recording.stopped': () => ({
        title: 'Aufnahme gestoppt',
        message: `Aufnahme für "${payload?.object?.topic || 'Meeting'}" wurde gestoppt`,
        icon: '⏹️',
        color: 'gray',
        meetingId: payload?.object?.id
      }),
      
      'webinar.started': () => ({
        title: 'Webinar gestartet',
        message: `Webinar "${payload?.object?.topic || ''}" ist jetzt live`,
        icon: '📺',
        color: 'orange',
        webinarId: payload?.object?.id
      }),
      
      'webinar.ended': () => ({
        title: 'Webinar beendet',
        message: `Webinar "${payload?.object?.topic || ''}" wurde beendet`,
        icon: '📺',
        color: 'gray',
        webinarId: payload?.object?.id
      }),
      
      'user.created': () => ({
        title: 'Neuer Benutzer',
        message: `${payload?.object?.email || 'Benutzer'} wurde zum Account hinzugefügt`,
        icon: '👤',
        color: 'green'
      }),

      'user.activated': () => ({
        title: 'Benutzer aktiviert',
        message: `${payload?.object?.email || 'Benutzer'} wurde aktiviert`,
        icon: '✅',
        color: 'green'
      }),
      
      'user.deactivated': () => ({
        title: 'Benutzer deaktiviert',
        message: `${payload?.object?.email || 'Benutzer'} wurde deaktiviert`,
        icon: '❌',
        color: 'red'
      }),

      'phone.callee_answered': () => ({
        title: 'Anruf angenommen',
        message: `Anruf von ${payload?.object?.caller?.phone_number || 'Unbekannt'}`,
        icon: '📞',
        color: 'green'
      }),

      'phone.callee_ended': () => ({
        title: 'Anruf beendet',
        message: `Anruf beendet (Dauer: ${payload?.object?.duration || 0}s)`,
        icon: '📞',
        color: 'gray'
      })
    };

    const formatter = formatters[type];
    if (formatter) {
      return {
        ...event,
        ui: formatter()
      };
    }

    // Default formatter für unbekannte Events
    return {
      ...event,
      ui: {
        title: type.replace(/\./g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        message: `Event empfangen: ${type}`,
        icon: '📌',
        color: 'gray'
      }
    };
  }
}

// Event-Typen die Zoom senden kann
export const ZOOM_EVENT_TYPES = {
  // Meeting Events
  MEETING_STARTED: 'meeting.started',
  MEETING_ENDED: 'meeting.ended',
  MEETING_PARTICIPANT_JOINED: 'meeting.participant_joined',
  MEETING_PARTICIPANT_LEFT: 'meeting.participant_left',
  MEETING_CREATED: 'meeting.created',
  MEETING_UPDATED: 'meeting.updated',
  MEETING_DELETED: 'meeting.deleted',
  
  // Recording Events
  RECORDING_STARTED: 'recording.started',
  RECORDING_STOPPED: 'recording.stopped',
  RECORDING_COMPLETED: 'recording.completed',
  RECORDING_TRASHED: 'recording.trashed',
  RECORDING_DELETED: 'recording.deleted',
  
  // Webinar Events
  WEBINAR_STARTED: 'webinar.started',
  WEBINAR_ENDED: 'webinar.ended',
  WEBINAR_PARTICIPANT_JOINED: 'webinar.participant_joined',
  WEBINAR_PARTICIPANT_LEFT: 'webinar.participant_left',
  
  // User Events
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_DEACTIVATED: 'user.deactivated',
  USER_ACTIVATED: 'user.activated',
  
  // Phone Events
  PHONE_CALLEE_ANSWERED: 'phone.callee_answered',
  PHONE_CALLEE_ENDED: 'phone.callee_ended'
};

export default ZoomWebhookHandler;
