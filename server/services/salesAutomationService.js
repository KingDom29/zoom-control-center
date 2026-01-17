/**
 * Sales Automation Service
 * Erzwingt Erfolg durch aggressive Automatisierung
 * 
 * Features:
 * 1. Auto-Reschedule bei No-Show
 * 2. Pre-Meeting Warm-Up (24h + 1h Reminder)
 * 3. Post-Meeting Auto-Follow-Up + GPT Summary
 * 4. Deal-Closer E-Mail Sequenz
 * 5. Auto-Booking für Leads
 * 6. Meeting-Ketten (automatische Folge-Meetings)
 */

import { zoomApi } from './zoomAuth.js';
import { emailService } from './emailService.js';
import { zendeskService } from './zendeskService.js';
import { meetingSummaryService } from './meetingSummaryService.js';
import logger from '../utils/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'de@maklerplan.com';
const DATA_FILE = path.join(__dirname, '../data/sales-automation.json');

class SalesAutomationService {

  constructor() {
    this.data = this.loadData();
  }

  loadData() {
    try {
      if (fs.existsSync(DATA_FILE)) {
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      }
    } catch (error) {
      logger.error('Sales Automation Daten laden Fehler', { error: error.message });
    }
    return {
      noShowReschedules: [],
      meetingChains: [],
      dealCloserSequences: [],
      warmUpsSent: [],
      followUpsSent: []
    };
  }

  saveData() {
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(this.data, null, 2));
    } catch (error) {
      logger.error('Sales Automation Daten speichern Fehler', { error: error.message });
    }
  }

  // ============================================
  // 1. AUTO-RESCHEDULE BEI NO-SHOW
  // ============================================

  /**
   * Prüft vergangene Meetings auf No-Shows und plant automatisch neu
   */
  async processNoShows() {
    logger.info('🔄 Starte No-Show Reschedule Check...');
    
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const from = yesterday.toISOString().split('T')[0];
      const to = new Date().toISOString().split('T')[0];

      // Hole alle User
      const usersResponse = await zoomApi('GET', '/users?status=active&page_size=300');
      const users = usersResponse.users || [];

      const rescheduled = [];

      for (const user of users) {
        try {
          const meetings = await zoomApi('GET', `/report/users/${user.id}/meetings?from=${from}&to=${to}`);
          
          for (const meeting of (meetings.meetings || [])) {
            // No-Show: Nur Host war da oder niemand
            if (meeting.participants_count <= 1 && meeting.duration > 0) {
              // Prüfe ob schon rescheduled
              const alreadyRescheduled = this.data.noShowReschedules.find(
                r => r.originalMeetingId === meeting.id
              );
              
              if (!alreadyRescheduled) {
                const result = await this.rescheduleNoShow(meeting, user);
                if (result.success) {
                  rescheduled.push(result);
                }
              }
            }
          }
        } catch (error) {
          // Skip user on error
        }
      }

      logger.info(`✅ No-Show Check abgeschlossen: ${rescheduled.length} neu geplant`);
      return { processed: rescheduled.length, rescheduled };
    } catch (error) {
      logger.error('No-Show Processing Fehler', { error: error.message });
      return { processed: 0, error: error.message };
    }
  }

  /**
   * Plant ein No-Show Meeting neu
   */
  async rescheduleNoShow(originalMeeting, host) {
    try {
      // Neues Meeting in 2 Tagen zur gleichen Zeit
      const newDate = new Date(originalMeeting.start_time);
      newDate.setDate(newDate.getDate() + 2);
      
      // Wochenende überspringen
      if (newDate.getDay() === 0) newDate.setDate(newDate.getDate() + 1);
      if (newDate.getDay() === 6) newDate.setDate(newDate.getDate() + 2);

      // Neues Meeting erstellen
      const newMeeting = await zoomApi('POST', `/users/${host.id}/meetings`, {
        topic: `${originalMeeting.topic} (Neuer Termin)`,
        type: 2,
        start_time: newDate.toISOString(),
        duration: originalMeeting.duration || 30,
        timezone: 'Europe/Berlin',
        settings: {
          host_video: true,
          participant_video: true,
          join_before_host: false,
          mute_upon_entry: true,
          auto_recording: 'cloud'
        }
      });

      // E-Mail an Teilnehmer (falls E-Mail bekannt)
      const participantEmail = originalMeeting.participant_email || null;
      
      if (participantEmail) {
        await this.sendRescheduleEmail(participantEmail, originalMeeting, newMeeting, newDate);
      }

      // Speichern
      const rescheduleRecord = {
        originalMeetingId: originalMeeting.id,
        originalTopic: originalMeeting.topic,
        originalDate: originalMeeting.start_time,
        newMeetingId: newMeeting.id,
        newDate: newDate.toISOString(),
        joinUrl: newMeeting.join_url,
        host: host.email,
        createdAt: new Date().toISOString()
      };

      this.data.noShowReschedules.push(rescheduleRecord);
      this.saveData();

      logger.info(`📅 No-Show rescheduled: ${originalMeeting.topic} → ${newDate.toLocaleDateString('de-DE')}`);

      return { success: true, ...rescheduleRecord };
    } catch (error) {
      logger.error('Reschedule Fehler', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  async sendRescheduleEmail(to, originalMeeting, newMeeting, newDate) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #1a73e8;">📅 Neuer Termin für Sie</h1>
        
        <p>Wir haben Sie beim letzten Termin vermisst!</p>
        
        <div style="background: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h2 style="margin-top: 0;">${newMeeting.topic}</h2>
          <p><strong>📆 Datum:</strong> ${newDate.toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
          <p><strong>🕐 Uhrzeit:</strong> ${newDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr</p>
        </div>
        
        <a href="${newMeeting.join_url}" style="display: inline-block; background: #1a73e8; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">
          🎥 Am Meeting teilnehmen
        </a>
        
        <p style="margin-top: 30px; color: #666;">
          Falls dieser Termin nicht passt, antworten Sie einfach auf diese E-Mail.
        </p>
        
        <p style="color: #999; font-size: 12px; margin-top: 30px;">
          Automatisch geplant • Maklerplan GmbH
        </p>
      </div>
    `;

    await emailService.sendEmail({
      to,
      subject: `📅 Neuer Termin: ${newMeeting.topic}`,
      html
    });
  }

  // ============================================
  // 2. PRE-MEETING WARM-UP
  // ============================================

  /**
   * Sendet Warm-Up E-Mails für Meetings in 24h und Reminder für 1h
   */
  async processPreMeetingWarmUps() {
    logger.info('📧 Starte Pre-Meeting Warm-Up...');
    
    try {
      const now = new Date();
      const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const in1h = new Date(now.getTime() + 60 * 60 * 1000);

      const usersResponse = await zoomApi('GET', '/users?status=active&page_size=300');
      const users = usersResponse.users || [];

      let warmUpsSent = 0;
      let remindersSent = 0;

      for (const user of users) {
        try {
          const meetings = await zoomApi('GET', `/users/${user.id}/meetings?type=upcoming`);
          
          for (const meeting of (meetings.meetings || [])) {
            const meetingTime = new Date(meeting.start_time);
            const hoursUntil = (meetingTime - now) / (1000 * 60 * 60);

            // 24h Warm-Up
            if (hoursUntil > 23 && hoursUntil <= 25) {
              const alreadySent = this.data.warmUpsSent.find(
                w => w.meetingId === meeting.id && w.type === '24h'
              );
              
              if (!alreadySent && meeting.registrants_email) {
                await this.send24hWarmUp(meeting);
                warmUpsSent++;
              }
            }

            // 1h Reminder
            if (hoursUntil > 0.5 && hoursUntil <= 1.5) {
              const alreadySent = this.data.warmUpsSent.find(
                w => w.meetingId === meeting.id && w.type === '1h'
              );
              
              if (!alreadySent && meeting.registrants_email) {
                await this.send1hReminder(meeting);
                remindersSent++;
              }
            }
          }
        } catch (error) {
          // Skip
        }
      }

      logger.info(`✅ Warm-Up: ${warmUpsSent} 24h E-Mails, ${remindersSent} 1h Reminder`);
      return { warmUpsSent, remindersSent };
    } catch (error) {
      logger.error('Warm-Up Fehler', { error: error.message });
      return { error: error.message };
    }
  }

  async send24hWarmUp(meeting) {
    const meetingDate = new Date(meeting.start_time);
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #1a73e8;">🗓️ Morgen ist es soweit!</h1>
        
        <p>Wir freuen uns auf unser Gespräch morgen.</p>
        
        <div style="background: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h2 style="margin-top: 0;">${meeting.topic}</h2>
          <p><strong>📆 Datum:</strong> ${meetingDate.toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
          <p><strong>🕐 Uhrzeit:</strong> ${meetingDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr</p>
          <p><strong>⏱️ Dauer:</strong> ca. ${meeting.duration} Minuten</p>
        </div>
        
        <h3>📋 Was Sie vorbereiten können:</h3>
        <ul>
          <li>Aktuelle Herausforderungen notieren</li>
          <li>Fragen die Sie haben</li>
          <li>Ziele die Sie erreichen möchten</li>
        </ul>
        
        <a href="${meeting.join_url}" style="display: inline-block; background: #1a73e8; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin-top: 20px;">
          🔗 Meeting-Link speichern
        </a>
        
        <p style="color: #999; font-size: 12px; margin-top: 30px;">
          Sie erhalten 1 Stunde vor dem Termin noch eine Erinnerung.
        </p>
      </div>
    `;

    await emailService.sendEmail({
      to: meeting.registrants_email || meeting.host_email,
      subject: `🗓️ Morgen: ${meeting.topic}`,
      html
    });

    this.data.warmUpsSent.push({
      meetingId: meeting.id,
      type: '24h',
      sentAt: new Date().toISOString()
    });
    this.saveData();
  }

  async send1hReminder(meeting) {
    const meetingDate = new Date(meeting.start_time);
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #22c55e;">⏰ In 1 Stunde geht's los!</h1>
        
        <div style="background: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #22c55e;">
          <h2 style="margin-top: 0;">${meeting.topic}</h2>
          <p><strong>🕐 Um:</strong> ${meetingDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr</p>
        </div>
        
        <a href="${meeting.join_url}" style="display: inline-block; background: #22c55e; color: white; padding: 20px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 18px;">
          🎥 JETZT TEILNEHMEN
        </a>
        
        <p style="margin-top: 20px; color: #666;">
          💡 <strong>Tipp:</strong> Testen Sie kurz Ihre Kamera und Mikrofon.
        </p>
      </div>
    `;

    await emailService.sendEmail({
      to: meeting.registrants_email || meeting.host_email,
      subject: `⏰ In 1 Stunde: ${meeting.topic}`,
      html
    });

    this.data.warmUpsSent.push({
      meetingId: meeting.id,
      type: '1h',
      sentAt: new Date().toISOString()
    });
    this.saveData();
  }

  // ============================================
  // 3. POST-MEETING AUTO-FOLLOW-UP
  // ============================================

  /**
   * Sendet automatisch Follow-Up nach Meeting-Ende
   * (Wird über Webhook aufgerufen)
   */
  async processPostMeetingFollowUp(meetingId, hostId) {
    logger.info(`📧 Post-Meeting Follow-Up für Meeting ${meetingId}`);
    
    try {
      // Meeting-Details holen
      const meeting = await zoomApi('GET', `/past_meetings/${meetingId}`);
      const host = await zoomApi('GET', `/users/${hostId}`);

      // Prüfe ob schon Follow-Up gesendet
      const alreadySent = this.data.followUpsSent.find(f => f.meetingId === meetingId);
      if (alreadySent) {
        return { success: false, reason: 'already_sent' };
      }

      // Erstelle Follow-Up E-Mail
      const followUpHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1a73e8;">✅ Danke für das Gespräch!</h1>
          
          <p>Vielen Dank für Ihre Zeit bei unserem Gespräch heute.</p>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0;">📋 Meeting-Details</h3>
            <p><strong>Thema:</strong> ${meeting.topic}</p>
            <p><strong>Dauer:</strong> ${meeting.duration || 0} Minuten</p>
            <p><strong>Host:</strong> ${host.first_name} ${host.last_name}</p>
          </div>
          
          <h3>🎯 Nächste Schritte:</h3>
          <p>Wir werden uns in den nächsten Tagen mit weiteren Informationen bei Ihnen melden.</p>
          
          <p>Bei Fragen können Sie jederzeit auf diese E-Mail antworten.</p>
          
          <p style="margin-top: 30px;">
            Mit freundlichen Grüßen,<br>
            <strong>${host.first_name} ${host.last_name}</strong><br>
            Maklerplan GmbH
          </p>
        </div>
      `;

      // Sende an alle Teilnehmer (wenn verfügbar)
      const participants = await zoomApi('GET', `/past_meetings/${meetingId}/participants`).catch(() => ({ participants: [] }));
      
      for (const participant of (participants.participants || [])) {
        if (participant.email && !participant.email.includes('maklerplan')) {
          await emailService.sendEmail({
            to: participant.email,
            subject: `✅ Danke für das Gespräch: ${meeting.topic}`,
            html: followUpHtml
          });
        }
      }

      // Speichern
      this.data.followUpsSent.push({
        meetingId,
        topic: meeting.topic,
        sentAt: new Date().toISOString()
      });
      this.saveData();

      // Automatisch Follow-Up Meeting in 7 Tagen planen
      await this.scheduleFollowUpMeeting(meeting, host);

      logger.info(`✅ Follow-Up gesendet für: ${meeting.topic}`);
      return { success: true, meetingId };
    } catch (error) {
      logger.error('Follow-Up Fehler', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  async scheduleFollowUpMeeting(originalMeeting, host) {
    const followUpDate = new Date();
    followUpDate.setDate(followUpDate.getDate() + 7);
    followUpDate.setHours(10, 0, 0, 0);

    // Wochenende überspringen
    if (followUpDate.getDay() === 0) followUpDate.setDate(followUpDate.getDate() + 1);
    if (followUpDate.getDay() === 6) followUpDate.setDate(followUpDate.getDate() + 2);

    try {
      const meeting = await zoomApi('POST', `/users/${host.id}/meetings`, {
        topic: `Follow-Up: ${originalMeeting.topic}`,
        type: 2,
        start_time: followUpDate.toISOString(),
        duration: 15,
        timezone: 'Europe/Berlin',
        settings: {
          host_video: true,
          participant_video: true,
          auto_recording: 'cloud'
        }
      });

      logger.info(`📅 Follow-Up Meeting geplant: ${followUpDate.toLocaleDateString('de-DE')}`);
      return meeting;
    } catch (error) {
      logger.error('Follow-Up Meeting Fehler', { error: error.message });
      return null;
    }
  }

  // ============================================
  // 4. DEAL-CLOSER E-MAIL SEQUENZ
  // ============================================

  /**
   * Startet Deal-Closer Sequenz nach Meeting ohne Abschluss
   */
  async startDealCloserSequence(contact, meetingInfo) {
    const sequence = {
      id: `dc_${Date.now()}`,
      contact,
      meetingInfo,
      startedAt: new Date().toISOString(),
      currentStep: 0,
      steps: [
        { day: 0, type: 'thank_you', sent: false },
        { day: 3, type: 'questions', sent: false },
        { day: 7, type: 'limited_offer', sent: false },
        { day: 14, type: 'last_chance', sent: false }
      ]
    };

    this.data.dealCloserSequences.push(sequence);
    this.saveData();

    // Sofort erste E-Mail senden
    await this.sendDealCloserEmail(sequence, 0);

    logger.info(`🎯 Deal-Closer Sequenz gestartet für: ${contact.email}`);
    return sequence;
  }

  async sendDealCloserEmail(sequence, stepIndex) {
    const step = sequence.steps[stepIndex];
    const contact = sequence.contact;

    const templates = {
      thank_you: {
        subject: `✅ Danke für das Gespräch, ${contact.firstName || contact.name}!`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px;">
            <h1>Danke für Ihre Zeit!</h1>
            <p>Es war toll, Sie kennenzulernen und über Ihre Ziele zu sprechen.</p>
            <p>Hier nochmal die wichtigsten Punkte aus unserem Gespräch:</p>
            <ul>
              <li>Ihre aktuelle Situation verstehen</li>
              <li>Möglichkeiten zur Optimierung</li>
              <li>Nächste Schritte</li>
            </ul>
            <p>Haben Sie noch Fragen? Antworten Sie einfach auf diese E-Mail.</p>
          </div>
        `
      },
      questions: {
        subject: `❓ Noch Fragen offen, ${contact.firstName || contact.name}?`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px;">
            <h1>Haben Sie noch Fragen?</h1>
            <p>Ich wollte kurz nachfragen, ob nach unserem Gespräch noch Fragen aufgekommen sind.</p>
            <p>Oft fallen einem die wichtigsten Fragen erst später ein - das ist völlig normal!</p>
            <p><strong>Antworten Sie einfach auf diese E-Mail</strong> und ich melde mich umgehend bei Ihnen.</p>
          </div>
        `
      },
      limited_offer: {
        subject: `🎁 Exklusives Angebot für Sie, ${contact.firstName || contact.name}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px;">
            <h1>🎁 Nur für Sie: Sonderkonditionen</h1>
            <p>Da wir bereits gesprochen haben, möchte ich Ihnen ein besonderes Angebot machen:</p>
            <div style="background: #fef3c7; padding: 20px; border-radius: 8px; border-left: 4px solid #f59e0b;">
              <strong>20% Rabatt auf die erste Zusammenarbeit</strong>
              <p style="margin-bottom: 0;">Gültig noch diese Woche!</p>
            </div>
            <p style="margin-top: 20px;">Interessiert? Antworten Sie mit "JA" und ich sende Ihnen die Details.</p>
          </div>
        `
      },
      last_chance: {
        subject: `⏰ Letzte Nachricht von mir, ${contact.firstName || contact.name}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px;">
            <h1>⏰ Eine letzte Frage...</h1>
            <p>Ich möchte Sie nicht weiter belästigen, daher ist dies meine letzte Nachricht.</p>
            <p>Aber bevor ich gehe, eine ehrliche Frage:</p>
            <p style="background: #f3f4f6; padding: 15px; border-radius: 8px; font-style: italic;">
              "Was hat Sie letztendlich davon abgehalten, mit uns zusammenzuarbeiten?"
            </p>
            <p>Ihr Feedback hilft mir, mich zu verbessern. Danke!</p>
          </div>
        `
      }
    };

    const template = templates[step.type];
    if (!template) return;

    await emailService.sendEmail({
      to: contact.email,
      subject: template.subject,
      html: template.html
    });

    // Update sequence
    sequence.steps[stepIndex].sent = true;
    sequence.steps[stepIndex].sentAt = new Date().toISOString();
    this.saveData();

    logger.info(`📧 Deal-Closer Step ${stepIndex + 1} gesendet: ${step.type}`);
  }

  /**
   * Verarbeitet alle aktiven Deal-Closer Sequenzen
   */
  async processDealCloserSequences() {
    const now = new Date();
    let processed = 0;

    for (const sequence of this.data.dealCloserSequences) {
      const startDate = new Date(sequence.startedAt);
      const daysSinceStart = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));

      for (let i = 0; i < sequence.steps.length; i++) {
        const step = sequence.steps[i];
        if (!step.sent && daysSinceStart >= step.day) {
          await this.sendDealCloserEmail(sequence, i);
          processed++;
        }
      }
    }

    return { processed };
  }

  // ============================================
  // 5. AUTO-BOOKING FÜR LEADS
  // ============================================

  /**
   * Generiert einen direkten Booking-Link
   */
  async createAutoBookingLink(hostId, options = {}) {
    try {
      const meeting = await zoomApi('POST', `/users/${hostId}/meetings`, {
        topic: options.topic || 'Persönliches Beratungsgespräch',
        type: 3, // Recurring meeting with no fixed time
        duration: options.duration || 30,
        timezone: 'Europe/Berlin',
        settings: {
          host_video: true,
          participant_video: true,
          join_before_host: false,
          registration_type: 2, // Registrierung erforderlich
          auto_recording: 'cloud',
          approval_type: 0 // Automatische Genehmigung
        }
      });

      return {
        meetingId: meeting.id,
        joinUrl: meeting.join_url,
        registrationUrl: meeting.registration_url,
        hostEmail: options.hostEmail
      };
    } catch (error) {
      logger.error('Auto-Booking Link Fehler', { error: error.message });
      throw error;
    }
  }

  // ============================================
  // 6. MEETING-KETTEN
  // ============================================

  /**
   * Definiert eine Meeting-Kette
   */
  async createMeetingChain(contact, chainType = 'onboarding') {
    const chains = {
      onboarding: [
        { name: 'Kennenlernen', daysAfter: 0, duration: 30 },
        { name: 'Setup & Einrichtung', daysAfter: 3, duration: 45 },
        { name: 'Training', daysAfter: 7, duration: 60 },
        { name: 'Check-In', daysAfter: 14, duration: 15 }
      ],
      sales: [
        { name: 'Erstgespräch', daysAfter: 0, duration: 30 },
        { name: 'Demo', daysAfter: 2, duration: 45 },
        { name: 'Angebot besprechen', daysAfter: 5, duration: 30 },
        { name: 'Abschluss', daysAfter: 7, duration: 15 }
      ]
    };

    const chain = chains[chainType] || chains.onboarding;
    const meetings = [];

    for (const step of chain) {
      const meetingDate = new Date();
      meetingDate.setDate(meetingDate.getDate() + step.daysAfter);
      meetingDate.setHours(10, 0, 0, 0);

      // Wochenende überspringen
      if (meetingDate.getDay() === 0) meetingDate.setDate(meetingDate.getDate() + 1);
      if (meetingDate.getDay() === 6) meetingDate.setDate(meetingDate.getDate() + 2);

      meetings.push({
        name: step.name,
        date: meetingDate.toISOString(),
        duration: step.duration,
        status: 'scheduled'
      });
    }

    const chainRecord = {
      id: `chain_${Date.now()}`,
      contact,
      type: chainType,
      meetings,
      createdAt: new Date().toISOString()
    };

    this.data.meetingChains.push(chainRecord);
    this.saveData();

    logger.info(`⛓️ Meeting-Kette erstellt: ${chainType} für ${contact.email}`);
    return chainRecord;
  }

  // ============================================
  // STATUS & STATS
  // ============================================

  getStats() {
    return {
      noShowReschedules: this.data.noShowReschedules.length,
      activeDealClosers: this.data.dealCloserSequences.filter(s => 
        s.steps.some(step => !step.sent)
      ).length,
      meetingChains: this.data.meetingChains.length,
      warmUpsSent: this.data.warmUpsSent.length,
      followUpsSent: this.data.followUpsSent.length
    };
  }
}

export const salesAutomationService = new SalesAutomationService();
