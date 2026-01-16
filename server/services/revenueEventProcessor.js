/**
 * Revenue Event Processor
 * Wandelt Zoom-Events in Business/Umsatz-Events um
 * Implementiert das Pilz-Prinzip: Lernt aus Event-Mustern
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';
import openaiService from './openaiService.js';
import emailService from './emailService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../data');
const EVENTS_FILE = path.join(DATA_DIR, 'revenue_events.json');
const PATTERNS_FILE = path.join(DATA_DIR, 'success_patterns.json');

// Business Event Types
export const REVENUE_EVENT_TYPES = {
  // Lead Events
  LEAD_ENGAGED: 'lead.engaged',
  LEAD_HOT: 'lead.hot',
  LEAD_CONVERTED: 'lead.converted',
  
  // Meeting Events
  MEETING_SUCCESS: 'meeting.success',
  MEETING_NOSHOW: 'meeting.noshow',
  WEBINAR_HIGH_ENGAGEMENT: 'webinar.high_engagement',
  
  // Sales Events
  SALE_SIGNAL: 'sale.signal',
  FOLLOWUP_TRIGGERED: 'followup.triggered',
  DEMO_REQUESTED: 'demo.requested'
};

class RevenueEventProcessor {
  constructor() {
    this.events = [];
    this.patterns = { successful: [], unsuccessful: [] };
    this.listeners = new Map();
    this.ensureDataDir();
    this.loadData();
  }

  ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  loadData() {
    try {
      if (fs.existsSync(EVENTS_FILE)) {
        this.events = JSON.parse(fs.readFileSync(EVENTS_FILE, 'utf8'));
      }
      if (fs.existsSync(PATTERNS_FILE)) {
        this.patterns = JSON.parse(fs.readFileSync(PATTERNS_FILE, 'utf8'));
      }
    } catch (error) {
      logger.error('Error loading revenue event data', { error: error.message });
    }
  }

  saveEvents() {
    try {
      fs.writeFileSync(EVENTS_FILE, JSON.stringify(this.events.slice(-1000), null, 2));
    } catch (error) {
      logger.error('Error saving revenue events', { error: error.message });
    }
  }

  savePatterns() {
    try {
      fs.writeFileSync(PATTERNS_FILE, JSON.stringify(this.patterns, null, 2));
    } catch (error) {
      logger.error('Error saving patterns', { error: error.message });
    }
  }

  /**
   * Registriert Event-Listener
   */
  on(eventType, handler) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }
    this.listeners.get(eventType).push(handler);
  }

  /**
   * Emittiert Business-Event an alle Listener
   */
  emit(event) {
    const handlers = [
      ...(this.listeners.get(event.type) || []),
      ...(this.listeners.get('*') || [])
    ];
    
    handlers.forEach(handler => {
      try {
        handler(event);
      } catch (error) {
        logger.error(`Error in revenue event handler`, { error: error.message });
      }
    });
  }

  /**
   * Verarbeitet Zoom-Event und generiert Business-Events
   */
  async processZoomEvent(zoomEvent) {
    const { type, payload, timestamp } = zoomEvent;
    const businessEvents = [];

    switch (type) {
      case 'meeting.ended':
        businessEvents.push(...await this.processMeetingEnded(payload, timestamp));
        break;

      case 'meeting.participant_joined':
        businessEvents.push(...this.processParticipantJoined(payload, timestamp));
        break;

      case 'webinar.ended':
        businessEvents.push(...await this.processWebinarEnded(payload, timestamp));
        break;

      case 'recording.completed':
        businessEvents.push(...this.processRecordingCompleted(payload, timestamp));
        break;
    }

    // Events speichern und emittieren
    for (const event of businessEvents) {
      this.events.push(event);
      this.emit(event);
      logger.info(`💰 Revenue Event: ${event.type}`, { eventId: event.id });
    }

    if (businessEvents.length > 0) {
      this.saveEvents();
    }

    return businessEvents;
  }

  /**
   * Verarbeitet Meeting-Ende
   */
  async processMeetingEnded(payload, timestamp) {
    const events = [];
    const meeting = payload?.object;
    if (!meeting) return events;

    const duration = meeting.duration || 0;
    const participants = meeting.participants || [];
    const topic = meeting.topic || '';

    // Meeting-Erfolg bewerten
    const isSuccessful = duration >= 15 && participants.length >= 2;
    
    if (isSuccessful) {
      events.push({
        id: crypto.randomUUID(),
        type: REVENUE_EVENT_TYPES.MEETING_SUCCESS,
        timestamp: new Date(timestamp).toISOString(),
        data: {
          meetingId: meeting.id,
          topic,
          duration,
          participantCount: participants.length,
          hostEmail: meeting.host?.email
        },
        score: this.calculateMeetingScore(duration, participants.length)
      });

      // Follow-up triggern
      events.push({
        id: crypto.randomUUID(),
        type: REVENUE_EVENT_TYPES.FOLLOWUP_TRIGGERED,
        timestamp: new Date(timestamp).toISOString(),
        data: {
          meetingId: meeting.id,
          topic,
          participants: participants.map(p => ({
            name: p.user_name,
            email: p.email
          })),
          followUpType: 'post_meeting',
          priority: duration >= 30 ? 'high' : 'medium'
        }
      });

      // KI-Follow-up generieren wenn aktiviert
      if (process.env.AI_FOLLOWUP_ENABLED === 'true') {
        await this.triggerAIFollowUp(meeting, participants);
      }
    } else if (duration < 5 && participants.length <= 1) {
      // No-Show erkennen
      events.push({
        id: crypto.randomUUID(),
        type: REVENUE_EVENT_TYPES.MEETING_NOSHOW,
        timestamp: new Date(timestamp).toISOString(),
        data: {
          meetingId: meeting.id,
          topic,
          hostEmail: meeting.host?.email
        }
      });
    }

    return events;
  }

  /**
   * Verarbeitet Teilnehmer-Beitritt
   */
  processParticipantJoined(payload, timestamp) {
    const events = [];
    const participant = payload?.object?.participant;
    const meeting = payload?.object;
    
    if (!participant || !meeting) return events;

    // Lead Engaged Event
    events.push({
      id: crypto.randomUUID(),
      type: REVENUE_EVENT_TYPES.LEAD_ENGAGED,
      timestamp: new Date(timestamp).toISOString(),
      data: {
        meetingId: meeting.id,
        topic: meeting.topic,
        participantName: participant.user_name,
        participantEmail: participant.email,
        joinTime: participant.join_time
      }
    });

    return events;
  }

  /**
   * Verarbeitet Webinar-Ende
   */
  async processWebinarEnded(payload, timestamp) {
    const events = [];
    const webinar = payload?.object;
    if (!webinar) return events;

    const duration = webinar.duration || 0;
    const attendees = webinar.participants_count || 0;
    const registrants = webinar.registrants_count || 0;

    // Engagement-Rate berechnen
    const engagementRate = registrants > 0 ? (attendees / registrants) * 100 : 0;

    if (engagementRate >= 50) {
      events.push({
        id: crypto.randomUUID(),
        type: REVENUE_EVENT_TYPES.WEBINAR_HIGH_ENGAGEMENT,
        timestamp: new Date(timestamp).toISOString(),
        data: {
          webinarId: webinar.id,
          topic: webinar.topic,
          attendees,
          registrants,
          engagementRate: Math.round(engagementRate),
          duration
        },
        score: Math.round(engagementRate)
      });
    }

    // Pattern speichern für Pilz-Prinzip
    this.recordPattern({
      type: 'webinar',
      topic: webinar.topic,
      dayOfWeek: new Date(timestamp).getDay(),
      hour: new Date(timestamp).getHours(),
      engagementRate,
      attendees,
      successful: engagementRate >= 50
    });

    return events;
  }

  /**
   * Verarbeitet Recording-Fertigstellung
   */
  processRecordingCompleted(payload, timestamp) {
    const events = [];
    const recording = payload?.object;
    if (!recording) return events;

    // Sale Signal wenn Recording verfügbar (Interesse an Wiedergabe)
    events.push({
      id: crypto.randomUUID(),
      type: REVENUE_EVENT_TYPES.SALE_SIGNAL,
      timestamp: new Date(timestamp).toISOString(),
      data: {
        meetingId: recording.id,
        topic: recording.topic,
        recordingFiles: recording.recording_files?.length || 0,
        signalType: 'recording_available'
      }
    });

    return events;
  }

  /**
   * Berechnet Meeting-Erfolgs-Score (0-100)
   */
  calculateMeetingScore(duration, participantCount) {
    let score = 0;
    
    // Dauer-Score (max 50 Punkte)
    if (duration >= 45) score += 50;
    else if (duration >= 30) score += 40;
    else if (duration >= 20) score += 30;
    else if (duration >= 15) score += 20;
    else score += 10;

    // Teilnehmer-Score (max 50 Punkte)
    if (participantCount >= 5) score += 50;
    else if (participantCount >= 3) score += 40;
    else if (participantCount >= 2) score += 30;
    else score += 10;

    return score;
  }

  /**
   * KI-gestütztes Follow-up triggern
   */
  async triggerAIFollowUp(meeting, participants) {
    try {
      const followUpContent = await openaiService.generateMeetingFollowUp({
        meetingTopic: meeting.topic,
        hostName: meeting.host?.email?.split('@')[0] || 'Team',
        participants,
        duration: meeting.duration
      });

      // E-Mail an alle Teilnehmer (außer Host)
      const recipientEmails = participants
        .filter(p => p.email && p.email !== meeting.host?.email)
        .map(p => p.email);

      if (recipientEmails.length > 0 && process.env.AI_FOLLOWUP_SEND === 'true') {
        await emailService.sendEmail({
          to: recipientEmails,
          subject: `Danke für Ihre Teilnahme: ${meeting.topic}`,
          body: followUpContent,
          isHtml: true
        });
        
        logger.info(`🤖 AI Follow-up sent to ${recipientEmails.length} participants`);
      } else {
        logger.info(`🤖 AI Follow-up generated (not sent - AI_FOLLOWUP_SEND not enabled)`);
      }
    } catch (error) {
      logger.error('Error generating AI follow-up', { error: error.message });
    }
  }

  /**
   * Pilz-Prinzip: Pattern aufzeichnen
   */
  recordPattern(pattern) {
    const patternList = pattern.successful ? this.patterns.successful : this.patterns.unsuccessful;
    patternList.push({
      ...pattern,
      recordedAt: new Date().toISOString()
    });

    // Nur die letzten 100 Patterns behalten
    if (patternList.length > 100) {
      patternList.shift();
    }

    this.savePatterns();
  }

  /**
   * Pilz-Prinzip: Erfolgs-Insights abrufen
   */
  getSuccessInsights() {
    const successful = this.patterns.successful;
    if (successful.length < 5) {
      return { message: 'Nicht genügend Daten für Insights', patterns: [] };
    }

    // Analysiere beste Wochentage
    const dayStats = {};
    const hourStats = {};
    
    successful.forEach(p => {
      dayStats[p.dayOfWeek] = (dayStats[p.dayOfWeek] || 0) + 1;
      hourStats[p.hour] = (hourStats[p.hour] || 0) + 1;
    });

    const bestDay = Object.entries(dayStats)
      .sort((a, b) => b[1] - a[1])[0];
    
    const bestHour = Object.entries(hourStats)
      .sort((a, b) => b[1] - a[1])[0];

    const dayNames = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

    return {
      totalSuccessful: successful.length,
      bestDayOfWeek: bestDay ? { day: dayNames[bestDay[0]], count: bestDay[1] } : null,
      bestHour: bestHour ? { hour: `${bestHour[0]}:00`, count: bestHour[1] } : null,
      avgEngagementRate: Math.round(
        successful.reduce((sum, p) => sum + (p.engagementRate || 0), 0) / successful.length
      ),
      recommendation: bestDay && bestHour 
        ? `Beste Performance: ${dayNames[bestDay[0]]} um ${bestHour[0]}:00 Uhr`
        : 'Mehr Daten benötigt'
    };
  }

  /**
   * Event-Historie abrufen
   */
  getEvents(options = {}) {
    let result = [...this.events];
    
    if (options.type) {
      result = result.filter(e => e.type === options.type);
    }
    
    if (options.since) {
      const sinceDate = new Date(options.since);
      result = result.filter(e => new Date(e.timestamp) >= sinceDate);
    }

    if (options.limit) {
      result = result.slice(-options.limit);
    }

    return result.reverse();
  }

  /**
   * Umsatz-Statistiken
   */
  getStats() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisWeek = new Date(today);
    thisWeek.setDate(thisWeek.getDate() - 7);

    const todayEvents = this.events.filter(e => new Date(e.timestamp) >= today);
    const weekEvents = this.events.filter(e => new Date(e.timestamp) >= thisWeek);

    return {
      total: this.events.length,
      today: {
        total: todayEvents.length,
        byType: this.countByType(todayEvents)
      },
      thisWeek: {
        total: weekEvents.length,
        byType: this.countByType(weekEvents)
      },
      insights: this.getSuccessInsights()
    };
  }

  countByType(events) {
    return events.reduce((acc, e) => {
      acc[e.type] = (acc[e.type] || 0) + 1;
      return acc;
    }, {});
  }
}

export const revenueEventProcessor = new RevenueEventProcessor();
export default revenueEventProcessor;
