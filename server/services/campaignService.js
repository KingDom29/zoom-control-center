/**
 * Campaign Service - Neujahres-Update 2026
 * Handles contact import, meeting scheduling, and email orchestration
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import XLSX from 'xlsx';
import { zoomApi } from './zoomAuth.js';
import { emailService, EMAIL_TEMPLATES } from './emailService.js';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CAMPAIGN_DB_PATH = path.join(__dirname, '../data/campaign.json');
const DATA_DIR = path.join(__dirname, '../data');

// Persistent token storage path
const TOKENS_DB_PATH = path.join(__dirname, '../data/click-tokens.json');

// Load tokens from disk
function loadClickTokens() {
  try {
    if (fs.existsSync(TOKENS_DB_PATH)) {
      const data = JSON.parse(fs.readFileSync(TOKENS_DB_PATH, 'utf-8'));
      // Filter out expired tokens (older than 30 days)
      const now = Date.now();
      const validTokens = {};
      for (const [token, info] of Object.entries(data)) {
        const age = now - new Date(info.createdAt).getTime();
        if (age < 30 * 24 * 60 * 60 * 1000) {
          validTokens[token] = info;
        }
      }
      return validTokens;
    }
  } catch (e) {
    logger.warn('Could not load click tokens', { error: e.message });
  }
  return {};
}

// Save tokens to disk
function saveClickTokens(tokens) {
  try {
    fs.writeFileSync(TOKENS_DB_PATH, JSON.stringify(tokens, null, 2));
  } catch (e) {
    logger.error('Could not save click tokens', { error: e.message });
  }
}

// Click tracking token storage (persistent)
let clickTokensData = loadClickTokens();

// Wrapper for Map-like interface but persistent
const clickTokens = {
  get(token) {
    return clickTokensData[token];
  },
  set(token, data) {
    clickTokensData[token] = data;
    saveClickTokens(clickTokensData);
  },
  delete(token) {
    delete clickTokensData[token];
    saveClickTokens(clickTokensData);
  },
  has(token) {
    return token in clickTokensData;
  }
};

// Generate tracking token for a contact
function generateClickToken(contactId, action) {
  const token = crypto.randomBytes(16).toString('hex');
  clickTokens.set(token, { contactId, action, createdAt: new Date().toISOString() });
  return token;
}

// Get tracking URL for email buttons
function getTrackingUrl(contactId, action) {
  const token = generateClickToken(contactId, action);
  const baseUrl = process.env.PUBLIC_URL || process.env.PUBLIC_BASE_URL || 'http://localhost:3001';
  return `${baseUrl}/api/campaign/track/${action}/${token}`;
}

// Export for use in routes
export { clickTokens, getTrackingUrl };

// Campaign Configuration
const CAMPAIGN_CONFIG = {
  name: 'Maklerplan Neujahres-Update 2026',
  startDate: '2026-01-19',
  workDays: [1, 2, 3, 4, 5], // Mo-Fr
  startHour: 9,
  endHour: 17,
  slotDurationMinutes: 45,
  breakBetweenSlots: 0,
  timezone: 'Europe/Berlin',
  
  // Team Members
  team: {
    host: { name: 'Herbert Nicklaus', email: 'hn@maklerplan.com', role: 'Host' },
    coHost: { name: 'Dominik Eisenhardt', email: 'de@maklerplan.com', role: 'Co-Host' },
    participant: { name: 'Nurcin Arikan', email: 'na@maklerplan.com', role: 'Teilnehmer' }
  },
  
  // Email Settings
  emailFrom: 'support@maklerplan.com',
  invitationDaysBefore: 7,  // X-7: Einladung
  reminderDaysBefore: 1,    // X-1: Erinnerung
  followUpDaysAfter: 1,     // X+1: Follow-up
  
  meetingSettings: {
    topic: 'Maklerplan Neujahres-Update 2026',
    duration: 45,
    type: 2, // Scheduled meeting
    settings: {
      host_video: true,
      participant_video: true,
      join_before_host: false,
      mute_upon_entry: false,
      waiting_room: true,
      auto_recording: 'cloud'  // Auto-Recording aktiviert
    }
  }
};

class CampaignService {
  constructor() {
    this.ensureDataDir();
    this.campaign = this.loadCampaign();
  }

  ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(CAMPAIGN_DB_PATH)) {
      this.saveCampaign(this.getEmptyCampaign());
    }
  }

  getEmptyCampaign() {
    return {
      metadata: {
        created: new Date().toISOString(),
        version: '1.0',
        config: CAMPAIGN_CONFIG
      },
      contacts: [],
      schedule: [],
      stats: {
        totalContacts: 0,
        scheduled: 0,
        invitationsSent: 0,
        remindersSent: 0,
        followUpsSent: 0,
        meetingsCompleted: 0,
        attended: 0,
        noShows: 0,
        partial: 0
      },
      pendingNoShowEmails: []
    };
  }

  loadCampaign() {
    try {
      if (fs.existsSync(CAMPAIGN_DB_PATH)) {
        const data = fs.readFileSync(CAMPAIGN_DB_PATH, 'utf-8');
        return JSON.parse(data);
      }
    } catch (error) {
      logger.error('Error loading campaign', { error: error.message });
    }
    return this.getEmptyCampaign();
  }

  saveCampaign(data = this.campaign) {
    try {
      fs.writeFileSync(CAMPAIGN_DB_PATH, JSON.stringify(data, null, 2));
      this.campaign = data;
    } catch (error) {
      logger.error('Error saving campaign', { error: error.message });
      throw error;
    }
  }

  generateId() {
    return crypto.randomUUID();
  }

  // ============================================
  // IMPORT CONTACTS
  // ============================================

  async importFromCSV(filePath) {
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`File not found: ${absolutePath}`);
    }

    const content = fs.readFileSync(absolutePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
      throw new Error('CSV file is empty or has no data rows');
    }

    // Parse header (semicolon-separated)
    const headers = lines[0].split(';').map(h => h.trim().toLowerCase());
    
    const contacts = [];
    const skipped = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(';').map(v => v.trim());
      const row = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] || '';
      });

      // Map to contact structure
      const email = row.email || row['e-mail'] || '';
      
      if (!email || !email.includes('@')) {
        skipped.push({ line: i + 1, reason: 'no_email', firma: row.firma });
        continue;
      }

      // Check for duplicates
      if (this.campaign.contacts.find(c => c.email.toLowerCase() === email.toLowerCase())) {
        skipped.push({ line: i + 1, reason: 'duplicate', email });
        continue;
      }

      const contact = {
        id: this.generateId(),
        firma: row.firma || '',
        anrede: row.anrede || '',
        vorname: row.vorname || '',
        nachname: row.nachname || '',
        email: email,
        telefon: row.telefon || '',
        bexioNr: row.bexio_nr || row.bexionr || '',
        tags: (row.tags || '').split(',').map(t => t.trim()).filter(Boolean),
        status: 'pending',
        scheduledSlot: null,
        zoomMeetingId: null,
        zoomJoinUrl: null,
        invitationSentAt: null,
        reminderSentAt: null,
        followUpSentAt: null,
        createdAt: new Date().toISOString()
      };

      contacts.push(contact);
    }

    // Add to campaign
    this.campaign.contacts.push(...contacts);
    this.campaign.stats.totalContacts = this.campaign.contacts.length;
    this.saveCampaign();

    return {
      imported: contacts.length,
      skipped: skipped.length,
      total: this.campaign.contacts.length,
      skippedDetails: skipped
    };
  }

  async importFromExcel(filePath) {
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`File not found: ${absolutePath}`);
    }

    const workbook = XLSX.readFile(absolutePath);
    const sheetName = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

    const contacts = [];
    const skipped = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      
      // Try to find email in various columns
      let email = row.email || row.Email || row['E-Mail'] || row['e-mail'] || '';
      
      // Check if firma contains email
      if (!email && row.firma && row.firma.includes('@')) {
        email = row.firma;
      }

      if (!email || !email.includes('@')) {
        skipped.push({ row: i + 1, reason: 'no_email', firma: row.firma });
        continue;
      }

      // Check for duplicates
      if (this.campaign.contacts.find(c => c.email.toLowerCase() === email.toLowerCase())) {
        skipped.push({ row: i + 1, reason: 'duplicate', email });
        continue;
      }

      const contact = {
        id: this.generateId(),
        firma: row.firma || row.Firma || '',
        anrede: row.anrede || row.Anrede || '',
        vorname: row.vorname || row.Vorname || '',
        nachname: row.nachname || row.Nachname || '',
        email: email,
        telefon: row.telefon || row.Telefon || '',
        bexioNr: row.bexio_nr || row.Bexio_Nr || '',
        tags: [],
        status: 'pending',
        scheduledSlot: null,
        zoomMeetingId: null,
        zoomJoinUrl: null,
        invitationSentAt: null,
        reminderSentAt: null,
        followUpSentAt: null,
        createdAt: new Date().toISOString()
      };

      contacts.push(contact);
    }

    this.campaign.contacts.push(...contacts);
    this.campaign.stats.totalContacts = this.campaign.contacts.length;
    this.saveCampaign();

    return {
      imported: contacts.length,
      skipped: skipped.length,
      total: this.campaign.contacts.length,
      skippedDetails: skipped
    };
  }

  // ============================================
  // SCHEDULING
  // ============================================

  generateTimeSlots(startDateStr, numberOfSlots) {
    const slots = [];
    const config = CAMPAIGN_CONFIG;
    
    let currentDate = new Date(startDateStr + 'T00:00:00');
    let currentHour = config.startHour;
    let currentMinute = 0;
    let hostIndex = 0;

    while (slots.length < numberOfSlots) {
      const dayOfWeek = currentDate.getDay();
      
      // Skip weekends
      if (!config.workDays.includes(dayOfWeek)) {
        currentDate.setDate(currentDate.getDate() + 1);
        currentHour = config.startHour;
        currentMinute = 0;
        continue;
      }

      // Check if within work hours
      const slotEndHour = currentHour + Math.floor((currentMinute + config.slotDurationMinutes) / 60);
      const slotEndMinute = (currentMinute + config.slotDurationMinutes) % 60;
      
      if (slotEndHour > config.endHour || (slotEndHour === config.endHour && slotEndMinute > 0)) {
        // Move to next day
        currentDate.setDate(currentDate.getDate() + 1);
        currentHour = config.startHour;
        currentMinute = 0;
        continue;
      }

      // Create slot
      const slotStart = new Date(currentDate);
      slotStart.setHours(currentHour, currentMinute, 0, 0);
      
      const slotEnd = new Date(slotStart);
      slotEnd.setMinutes(slotEnd.getMinutes() + config.slotDurationMinutes);

      // Herbert is always the host
      const host = config.team.host;

      slots.push({
        id: this.generateId(),
        startTime: slotStart.toISOString(),
        endTime: slotEnd.toISOString(),
        date: slotStart.toISOString().split('T')[0],
        timeStr: `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`,
        host: host,
        team: [
          config.team.host,
          config.team.coHost,
          config.team.participant
        ],
        contactId: null,
        zoomMeetingId: null,
        status: 'available'
      });

      // Move to next slot
      currentMinute += config.slotDurationMinutes + config.breakBetweenSlots;
      if (currentMinute >= 60) {
        currentHour += Math.floor(currentMinute / 60);
        currentMinute = currentMinute % 60;
      }
    }

    return slots;
  }

  scheduleContacts() {
    const pendingContacts = this.campaign.contacts.filter(c => c.status === 'pending');
    
    if (pendingContacts.length === 0) {
      return { scheduled: 0, message: 'No pending contacts to schedule' };
    }

    // Generate slots for all pending contacts
    const slots = this.generateTimeSlots(CAMPAIGN_CONFIG.startDate, pendingContacts.length);
    
    // Assign contacts to slots
    for (let i = 0; i < pendingContacts.length; i++) {
      const contact = pendingContacts[i];
      const slot = slots[i];
      
      slot.contactId = contact.id;
      slot.status = 'scheduled';
      
      // Update contact
      const contactIdx = this.campaign.contacts.findIndex(c => c.id === contact.id);
      this.campaign.contacts[contactIdx].scheduledSlot = slot;
      this.campaign.contacts[contactIdx].status = 'scheduled';
    }

    this.campaign.schedule = slots;
    this.campaign.stats.scheduled = pendingContacts.length;
    this.saveCampaign();

    // Calculate campaign duration
    const firstSlot = slots[0];
    const lastSlot = slots[slots.length - 1];
    const startDate = new Date(firstSlot.startTime);
    const endDate = new Date(lastSlot.startTime);
    const durationDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
    const durationWeeks = Math.ceil(durationDays / 7);

    return {
      scheduled: pendingContacts.length,
      firstMeeting: firstSlot.startTime,
      lastMeeting: lastSlot.startTime,
      durationDays,
      durationWeeks,
      slotsPerDay: Math.floor((CAMPAIGN_CONFIG.endHour - CAMPAIGN_CONFIG.startHour) * 60 / CAMPAIGN_CONFIG.slotDurationMinutes)
    };
  }

  getSchedulePreview() {
    const schedule = this.campaign.schedule;
    
    // Group by date
    const byDate = {};
    for (const slot of schedule) {
      const date = slot.date;
      if (!byDate[date]) {
        byDate[date] = [];
      }
      const contact = this.campaign.contacts.find(c => c.id === slot.contactId);
      byDate[date].push({
        time: slot.timeStr,
        host: slot.host.name,
        contact: contact ? `${contact.anrede} ${contact.vorname} ${contact.nachname}`.trim() || contact.firma : 'TBD',
        email: contact?.email || '',
        status: slot.status
      });
    }

    return {
      totalSlots: schedule.length,
      dates: Object.keys(byDate).sort(),
      byDate
    };
  }

  // ============================================
  // ZOOM MEETING CREATION
  // ============================================

  async createZoomMeetings(limit = 10) {
    const scheduledContacts = this.campaign.contacts.filter(
      c => c.status === 'scheduled' && !c.zoomMeetingId && c.scheduledSlot
    );

    const toProcess = scheduledContacts.slice(0, limit);
    const results = { created: 0, failed: 0, errors: [] };

    for (const contact of toProcess) {
      try {
        const slot = contact.scheduledSlot;
        const hostEmail = slot.host.email;
        
        // Create meeting via Zoom API
        // Herbert = Host, Team wird über E-Mail + Zoom-Link eingeladen
        const meetingData = {
          topic: `${CAMPAIGN_CONFIG.meetingSettings.topic} - ${contact.firma || contact.nachname}`,
          type: CAMPAIGN_CONFIG.meetingSettings.type,
          start_time: slot.startTime,
          duration: CAMPAIGN_CONFIG.meetingSettings.duration,
          timezone: CAMPAIGN_CONFIG.timezone,
          settings: {
            ...CAMPAIGN_CONFIG.meetingSettings.settings
            // Note: alternative_hosts entfernt - nur lizenzierte Zoom-User möglich
            // Team (Dominik, Nurcin) werden über Kalender-Einladung + Join-Link eingeladen
          }
        };

        const meeting = await zoomApi('POST', `/users/${hostEmail}/meetings`, meetingData);

        // Update contact
        const contactIdx = this.campaign.contacts.findIndex(c => c.id === contact.id);
        this.campaign.contacts[contactIdx].zoomMeetingId = meeting.id;
        this.campaign.contacts[contactIdx].zoomJoinUrl = meeting.join_url;
        this.campaign.contacts[contactIdx].zoomStartUrl = meeting.start_url;
        this.campaign.contacts[contactIdx].status = 'meeting_created';

        // Update slot
        const slotIdx = this.campaign.schedule.findIndex(s => s.id === slot.id);
        if (slotIdx >= 0) {
          this.campaign.schedule[slotIdx].zoomMeetingId = meeting.id;
          this.campaign.schedule[slotIdx].status = 'meeting_created';
        }

        results.created++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          contactId: contact.id,
          email: contact.email,
          error: error.message
        });
      }
    }

    this.saveCampaign();
    return results;
  }

  // ============================================
  // EMAIL ORCHESTRATION
  // ============================================

  async sendInvitations(limit = 10) {
    const readyContacts = this.campaign.contacts.filter(
      c => c.status === 'meeting_created' && !c.invitationSentAt && c.zoomJoinUrl
    );

    const toProcess = readyContacts.slice(0, limit);
    const results = { sent: 0, failed: 0, errors: [] };

    for (const contact of toProcess) {
      try {
        const slot = contact.scheduledSlot;
        const meetingDate = new Date(slot.startTime);
        
        const dateStr = meetingDate.toLocaleDateString('de-DE', {
          weekday: 'long',
          day: '2-digit',
          month: 'long',
          year: 'numeric'
        });
        const timeStr = meetingDate.toLocaleTimeString('de-DE', {
          hour: '2-digit',
          minute: '2-digit'
        });

        const anrede = contact.anrede === 'Frau' ? 'Sehr geehrte Frau' : 
                       contact.anrede === 'Herr' ? 'Sehr geehrter Herr' : 
                       'Guten Tag';
        const name = contact.nachname || contact.firma || '';

        // Generate ICS calendar attachment
        const icsContent = this.generateICS(contact);
        const icsBase64 = Buffer.from(icsContent, 'utf-8').toString('base64');
        
        // Generate tracking URLs
        const cancelUrl = getTrackingUrl(contact.id, 'cancel');
        
        // Send to customer + team (CC)
        await emailService.sendEmail({
          to: contact.email,
          replyTo: 'support@maklerplan.com',
          subject: emailService.replaceVariables('Kurzer Austausch zum Jahresstart? | Termin am {{datum}}', { datum: dateStr }),
          body: emailService.replaceVariables(EMAIL_TEMPLATES.neujahr_einladung.body, {
            anrede: `${anrede} ${name}`,
            firma: contact.firma,
            datum: dateStr,
            uhrzeit: timeStr,
            zoomLink: this.getJoinLink(contact),
            cancel_url: cancelUrl
          }),
          attachments: [{
            name: `Termin-${dateStr.replace(/[,\s]+/g, '-')}.ics`,
            contentType: 'text/calendar',
            contentBase64: icsBase64
          }]
        });

        // Update contact
        const contactIdx = this.campaign.contacts.findIndex(c => c.id === contact.id);
        this.campaign.contacts[contactIdx].invitationSentAt = new Date().toISOString();
        this.campaign.contacts[contactIdx].status = 'invitation_sent';
        
        this.campaign.stats.invitationsSent++;
        results.sent++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          contactId: contact.id,
          email: contact.email,
          error: error.message
        });
      }
    }

    this.saveCampaign();
    return results;
  }

  async sendReminders(limit = 10) {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const readyContacts = this.campaign.contacts.filter(c => {
      if (c.status !== 'invitation_sent' || c.reminderSentAt) return false;
      
      const meetingDate = new Date(c.scheduledSlot?.startTime);
      const diffHours = (meetingDate - now) / (1000 * 60 * 60);
      
      // Send reminder 24h before
      return diffHours > 0 && diffHours <= 48;
    });

    const toProcess = readyContacts.slice(0, limit);
    const results = { sent: 0, failed: 0, errors: [] };

    for (const contact of toProcess) {
      try {
        const slot = contact.scheduledSlot;
        const meetingDate = new Date(slot.startTime);
        
        const dateStr = meetingDate.toLocaleDateString('de-DE', {
          weekday: 'long',
          day: '2-digit',
          month: 'long'
        });
        const timeStr = meetingDate.toLocaleTimeString('de-DE', {
          hour: '2-digit',
          minute: '2-digit'
        });

        const anrede = contact.anrede === 'Frau' ? 'Sehr geehrte Frau' : 
                       contact.anrede === 'Herr' ? 'Sehr geehrter Herr' : 
                       'Guten Tag';
        const name = contact.nachname || contact.firma || '';

        // Generate ICS calendar attachment
        const icsContent = this.generateICS(contact);
        const icsBase64 = Buffer.from(icsContent, 'utf-8').toString('base64');
        
        // Generate tracking URLs
        const cancelUrl = getTrackingUrl(contact.id, 'cancel');
        
        // Send to customer + team (CC)
        await emailService.sendEmail({
          to: contact.email,
          replyTo: 'support@maklerplan.com',
          subject: emailService.replaceVariables('Kurze Erinnerung: Morgen um {{uhrzeit}} Uhr', { uhrzeit: timeStr }),
          body: emailService.replaceVariables(EMAIL_TEMPLATES.neujahr_erinnerung.body, {
            anrede: `${anrede} ${name}`,
            datum: dateStr,
            uhrzeit: timeStr,
            zoomLink: this.getJoinLink(contact),
            cancel_url: cancelUrl
          }),
          attachments: [{
            name: `Erinnerung-Termin-${dateStr.replace(/[,\s]+/g, '-')}.ics`,
            contentType: 'text/calendar',
            contentBase64: icsBase64
          }]
        });

        const contactIdx = this.campaign.contacts.findIndex(c => c.id === contact.id);
        this.campaign.contacts[contactIdx].reminderSentAt = new Date().toISOString();
        
        this.campaign.stats.remindersSent++;
        results.sent++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          contactId: contact.id,
          email: contact.email,
          error: error.message
        });
      }
    }

    this.saveCampaign();
    return results;
  }

  // ============================================
  // ICS CALENDAR GENERATION
  // ============================================

  getPublicBaseUrl() {
    const raw = process.env.PUBLIC_BASE_URL || process.env.APP_PUBLIC_URL;
    if (!raw) return null;
    return raw.replace(/\/+$/, '');
  }

  getJoinLink(contact) {
    const baseUrl = this.getPublicBaseUrl();
    if (!baseUrl || !contact?.id) return contact?.zoomJoinUrl || '';
    return `${baseUrl}/api/campaign/join/${contact.id}`;
  }

  generateICS(contact) {
    const slot = contact.scheduledSlot;
    if (!slot) return null;

    const startDate = new Date(slot.startTime);
    const endDate = new Date(slot.endTime);
    const team = CAMPAIGN_CONFIG.team;
    const joinLink = this.getJoinLink(contact);

    // Format dates for ICS (YYYYMMDDTHHMMSSZ)
    const formatICSDate = (date) => {
      return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    };

    // All attendees: Team + Customer
    const attendees = [
      `ATTENDEE;CN=${team.host.name};ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:${team.host.email}`,
      `ATTENDEE;CN=${team.coHost.name};ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:${team.coHost.email}`,
      `ATTENDEE;CN=${team.participant.name};ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:${team.participant.email}`,
      `ATTENDEE;CN=${contact.vorname} ${contact.nachname};ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:${contact.email}`
    ].join('\r\n');

    const customerName = `${contact.anrede} ${contact.vorname} ${contact.nachname}`.trim() || contact.firma;

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Maklerplan//Neujahres-Update 2026//DE',
      'CALSCALE:GREGORIAN',
      'METHOD:REQUEST',
      'BEGIN:VEVENT',
      `UID:${contact.id}@maklerplan.com`,
      `DTSTAMP:${formatICSDate(new Date())}`,
      `DTSTART:${formatICSDate(startDate)}`,
      `DTEND:${formatICSDate(endDate)}`,
      `SUMMARY:Maklerplan Neujahres-Update 2026 - ${customerName}`,
      `DESCRIPTION:Zoom Meeting mit ${customerName}\\n\\nJoin-Link: ${joinLink || 'TBD'}\\n\\nTeilnehmer:\\n- ${team.host.name} (Host)\\n- ${team.coHost.name} (Co-Host)\\n- ${team.participant.name}\\n- ${customerName}`,
      `LOCATION:Zoom Meeting`,
      `URL:${joinLink || ''}`,
      `ORGANIZER;CN=Maklerplan:mailto:${CAMPAIGN_CONFIG.emailFrom}`,
      attendees,
      'STATUS:CONFIRMED',
      'SEQUENCE:0',
      'BEGIN:VALARM',
      'TRIGGER:-PT15M',
      'ACTION:DISPLAY',
      'DESCRIPTION:Meeting in 15 Minuten',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    return ics;
  }

  // ============================================
  // FOLLOW-UP EMAILS
  // ============================================

  async sendFollowUps(limit = 10) {
    const now = new Date();
    
    const readyContacts = this.campaign.contacts.filter(c => {
      if (c.status !== 'invitation_sent' || c.followUpSentAt) return false;
      
      const meetingDate = new Date(c.scheduledSlot?.startTime);
      const diffHours = (now - meetingDate) / (1000 * 60 * 60);
      
      // Send follow-up 24h after meeting
      return diffHours >= 24 && diffHours <= 72;
    });

    const toProcess = readyContacts.slice(0, limit);
    const results = { sent: 0, failed: 0, errors: [] };

    for (const contact of toProcess) {
      try {
        const anrede = contact.anrede === 'Frau' ? 'Sehr geehrte Frau' : 
                       contact.anrede === 'Herr' ? 'Sehr geehrter Herr' : 
                       'Guten Tag';
        const name = contact.nachname || contact.firma || '';

        await emailService.sendTemplateEmail({ to: contact.email, templateId: 'neujahr_followup', variables: {
          anrede: `${anrede} ${name}`,
          vorname: contact.vorname || name,
          firma: contact.firma
        }});

        const contactIdx = this.campaign.contacts.findIndex(c => c.id === contact.id);
        this.campaign.contacts[contactIdx].followUpSentAt = new Date().toISOString();
        this.campaign.contacts[contactIdx].status = 'followup_sent';
        
        this.campaign.stats.followUpsSent++;
        results.sent++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          contactId: contact.id,
          email: contact.email,
          error: error.message
        });
      }
    }

    this.saveCampaign();
    return results;
  }

  // ============================================
  // STATS & INFO
  // ============================================

  getStats() {
    const contacts = this.campaign.contacts;
    
    const byStatus = {};
    for (const c of contacts) {
      byStatus[c.status] = (byStatus[c.status] || 0) + 1;
    }

    return {
      ...this.campaign.stats,
      byStatus,
      config: CAMPAIGN_CONFIG
    };
  }

  getContacts(filters = {}) {
    let results = [...this.campaign.contacts];

    if (filters.status) {
      results = results.filter(c => c.status === filters.status);
    }

    if (filters.search) {
      const s = filters.search.toLowerCase();
      results = results.filter(c => 
        c.firma.toLowerCase().includes(s) ||
        c.email.toLowerCase().includes(s) ||
        c.nachname.toLowerCase().includes(s)
      );
    }

    return results;
  }

  resetCampaign() {
    this.campaign = this.getEmptyCampaign();
    this.saveCampaign();
    return { success: true, message: 'Campaign reset' };
  }

  // ============================================
  // ATTENDANCE TRACKING (No-Show Detection)
  // ============================================

  /**
   * Process meeting end and determine attendance status
   * @param {string} zoomMeetingId - The Zoom meeting ID
   * @param {Array} participants - List of participants from Zoom webhook
   */
  async processMeetingEnd(zoomMeetingId, participants = []) {
    // Find contact by Zoom meeting ID
    const contact = this.campaign.contacts.find(c => 
      c.zoomMeetingId?.toString() === zoomMeetingId?.toString()
    );

    if (!contact) {
      logger.warn(`⚠️ No campaign contact found for meeting ${zoomMeetingId}`);
      return null;
    }

    // Check if customer attended
    const customerEmail = contact.email.toLowerCase();
    const customerParticipant = participants.find(p => 
      p.user_email?.toLowerCase() === customerEmail ||
      p.email?.toLowerCase() === customerEmail
    );

    let attendanceStatus;
    let attendanceDuration = 0;

    if (!customerParticipant) {
      // Customer did not join
      attendanceStatus = 'no_show';
      logger.info(`❌ No-Show: ${contact.email} - Meeting ${zoomMeetingId}`);
    } else {
      // Calculate attendance duration in minutes
      attendanceDuration = customerParticipant.duration || 0;
      
      if (attendanceDuration < 5) {
        attendanceStatus = 'partial';
        logger.warn(`⚠️ Partial: ${contact.email} - ${attendanceDuration} Min - Meeting ${zoomMeetingId}`);
      } else {
        attendanceStatus = 'attended';
        logger.info(`✅ Attended: ${contact.email} - ${attendanceDuration} Min - Meeting ${zoomMeetingId}`);
      }
    }

    // Update contact
    const contactIdx = this.campaign.contacts.findIndex(c => c.id === contact.id);
    this.campaign.contacts[contactIdx].attendanceStatus = attendanceStatus;
    this.campaign.contacts[contactIdx].attendanceDuration = attendanceDuration;
    this.campaign.contacts[contactIdx].meetingEndedAt = new Date().toISOString();

    // Update stats
    if (!this.campaign.stats.attended) this.campaign.stats.attended = 0;
    if (!this.campaign.stats.noShows) this.campaign.stats.noShows = 0;
    if (!this.campaign.stats.partial) this.campaign.stats.partial = 0;

    if (attendanceStatus === 'attended') {
      this.campaign.stats.attended++;
      this.campaign.stats.meetingsCompleted++;
    } else if (attendanceStatus === 'no_show') {
      this.campaign.stats.noShows++;
      // Schedule no-show follow-up email (1 hour delay)
      this.scheduleNoShowEmail(contact.id);
    } else if (attendanceStatus === 'partial') {
      this.campaign.stats.partial++;
    }

    this.saveCampaign();

    return {
      contactId: contact.id,
      email: contact.email,
      attendanceStatus,
      attendanceDuration
    };
  }

  /**
   * Schedule a no-show follow-up email (1 hour delay)
   */
  scheduleNoShowEmail(contactId) {
    if (!this.campaign.pendingNoShowEmails) {
      this.campaign.pendingNoShowEmails = [];
    }

    const sendAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour from now
    
    this.campaign.pendingNoShowEmails.push({
      contactId,
      scheduledAt: new Date().toISOString(),
      sendAt,
      sent: false
    });

    logger.info(`📧 No-Show E-Mail geplant für ${sendAt}`);
    this.saveCampaign();
  }

  /**
   * Process pending no-show emails (called by cron job)
   */
  async processPendingNoShowEmails() {
    if (!this.campaign.pendingNoShowEmails) return { sent: 0 };

    const now = new Date();
    const toSend = this.campaign.pendingNoShowEmails.filter(
      p => !p.sent && new Date(p.sendAt) <= now
    );

    const results = { sent: 0, failed: 0, errors: [] };

    for (const pending of toSend) {
      try {
        const contact = this.campaign.contacts.find(c => c.id === pending.contactId);
        if (!contact) continue;

        // Check if still a no-show (status might have been updated manually)
        if (contact.attendanceStatus !== 'no_show') {
          pending.sent = true;
          pending.skipped = true;
          continue;
        }

        await this.sendNoShowEmail(contact);
        
        pending.sent = true;
        pending.sentAt = new Date().toISOString();
        results.sent++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          contactId: pending.contactId,
          error: error.message
        });
      }
    }

    this.saveCampaign();
    return results;
  }

  /**
   * Send no-show follow-up email
   */
  async sendNoShowEmail(contact) {
    const anrede = contact.anrede === 'Frau' ? 'Sehr geehrte Frau' : 
                   contact.anrede === 'Herr' ? 'Sehr geehrter Herr' : 
                   'Guten Tag';
    const name = contact.nachname || contact.firma || '';

    // Generate tracking URLs
    const quickCallUrl = getTrackingUrl(contact.id, 'quick-call');
    const noInterestUrl = getTrackingUrl(contact.id, 'no-interest');

    await emailService.sendTemplateEmail({
      to: contact.email,
      templateId: 'noshow_followup',
      variables: {
        anrede: `${anrede} ${name}`,
        firma: contact.firma,
        quick_call_url: quickCallUrl,
        no_interest_url: noInterestUrl
      }
    });

    // Update contact
    const contactIdx = this.campaign.contacts.findIndex(c => c.id === contact.id);
    this.campaign.contacts[contactIdx].noShowEmailSentAt = new Date().toISOString();
    this.saveCampaign();

    logger.info(`📧 No-Show E-Mail gesendet an ${contact.email}`);
    return { success: true, email: contact.email };
  }

  /**
   * Get attendance statistics
   */
  getAttendanceStats() {
    const contacts = this.campaign.contacts.filter(c => c.meetingEndedAt);
    
    const attended = contacts.filter(c => c.attendanceStatus === 'attended').length;
    const noShows = contacts.filter(c => c.attendanceStatus === 'no_show').length;
    const partial = contacts.filter(c => c.attendanceStatus === 'partial').length;
    const total = attended + noShows + partial;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const todayNoShows = contacts.filter(c => 
      c.attendanceStatus === 'no_show' && 
      new Date(c.meetingEndedAt) >= todayStart
    );

    return {
      total,
      attended,
      noShows,
      partial,
      attendanceRate: total > 0 ? Math.round((attended / total) * 100) : 0,
      noShowRate: total > 0 ? Math.round((noShows / total) * 100) : 0,
      partialRate: total > 0 ? Math.round((partial / total) * 100) : 0,
      todayNoShows: todayNoShows.map(c => ({
        id: c.id,
        name: `${c.vorname} ${c.nachname}`.trim() || c.firma,
        email: c.email,
        time: c.scheduledSlot?.timeStr,
        meetingEndedAt: c.meetingEndedAt
      })),
      pendingNoShowEmails: (this.campaign.pendingNoShowEmails || []).filter(p => !p.sent).length
    };
  }

  /**
   * Manually send no-show email for a contact
   */
  async sendManualNoShowEmail(contactId) {
    const contact = this.campaign.contacts.find(c => c.id === contactId);
    if (!contact) {
      throw new Error('Contact not found');
    }
    return this.sendNoShowEmail(contact);
  }

  // =============================================
  // DATA ENRICHMENT & SEGMENTATION
  // =============================================

  /**
   * Calculate priority score for a contact
   */
  calculatePriorityScore(contact) {
    let score = 0;
    
    // Reply-based scoring
    if (contact.replies?.length > 0) score += 30;
    if (contact.replySentiment === 'positive') score += 20;
    if (contact.replySentiment === 'negative') score -= 10;
    if (contact.replyCategory === 'urgent') score += 25;
    
    // Timing-based scoring
    const meetingDate = contact.scheduledSlot?.date;
    if (meetingDate) {
      if (meetingDate <= '2026-01-31') score += 15;
      else if (meetingDate <= '2026-02-28') score += 5;
      else if (meetingDate > '2026-03-31') score -= 10;
    }
    
    // Data quality scoring
    if (contact.telefon) score += 10;
    if (contact.geo?.city) score += 5;
    if (contact.enrichment?.website) score += 5;
    if (contact.enrichment?.rating) score += 5;
    
    // Engagement scoring
    if (contact.attendanceStatus === 'attended') score += 20;
    if (contact.attendanceStatus === 'no_show') score -= 15;
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Determine contact segment
   */
  getContactSegment(contact) {
    const meetingDate = contact.scheduledSlot?.date;
    
    if (!meetingDate) return 'no_meeting';
    if (meetingDate <= '2026-01-31') return 'jan_ok';
    if (meetingDate <= '2026-02-28') return 'feb_soon';
    if (meetingDate <= '2026-03-31') return 'march_late';
    return 'very_late';
  }

  /**
   * Sync email replies to contacts
   */
  async syncRepliesToContacts(replies) {
    let updated = 0;
    
    for (const reply of replies) {
      const contactIdx = this.campaign.contacts.findIndex(
        c => c.email?.toLowerCase() === reply.from?.toLowerCase()
      );
      
      if (contactIdx >= 0) {
        const contact = this.campaign.contacts[contactIdx];
        
        // Initialize replies array
        if (!contact.replies) contact.replies = [];
        
        // Check if reply already exists
        const exists = contact.replies.some(r => r.id === reply.id);
        if (!exists) {
          contact.replies.push({
            id: reply.id,
            subject: reply.subject,
            preview: reply.preview,
            receivedAt: reply.receivedAt,
            isRead: reply.isRead
          });
          
          // Update last reply timestamp
          contact.lastReplyAt = reply.receivedAt;
          contact.hasReplied = true;
          updated++;
        }
      }
    }
    
    if (updated > 0) {
      this.saveCampaign();
      logger.info(`📨 ${updated} Replies zu Kontakten synchronisiert`);
    }
    
    return { updated };
  }

  /**
   * Analyze reply sentiment using keywords
   */
  analyzeReplySentiment(reply) {
    const text = `${reply.subject} ${reply.preview}`.toLowerCase();
    
    const positiveKeywords = ['zugesagt', 'bestätigt', 'freue', 'gerne', 'danke', 'ja', 'termin passt'];
    const negativeKeywords = ['absage', 'kündigung', 'keine zeit', 'nicht interessiert', 'abmelden', 'stopp'];
    const urgentKeywords = ['dringend', 'schnell', 'sofort', 'asap', 'heute', 'anrufen'];
    const rescheduleKeywords = ['verschieben', 'anderer termin', 'neuer termin', 'passt nicht'];
    
    let sentiment = 'neutral';
    let category = 'other';
    
    if (positiveKeywords.some(k => text.includes(k))) sentiment = 'positive';
    if (negativeKeywords.some(k => text.includes(k))) sentiment = 'negative';
    if (urgentKeywords.some(k => text.includes(k))) category = 'urgent';
    else if (rescheduleKeywords.some(k => text.includes(k))) category = 'reschedule';
    else if (text.includes('?')) category = 'question';
    
    return { sentiment, category };
  }

  /**
   * Enrich all contacts with segments and scores
   */
  async enrichAllContacts() {
    let enriched = 0;
    
    for (const contact of this.campaign.contacts) {
      // Calculate segment
      contact.segment = this.getContactSegment(contact);
      
      // Analyze replies if present
      if (contact.replies?.length > 0) {
        const latestReply = contact.replies[contact.replies.length - 1];
        const { sentiment, category } = this.analyzeReplySentiment(latestReply);
        contact.replySentiment = sentiment;
        contact.replyCategory = category;
      }
      
      // Calculate priority score
      contact.priorityScore = this.calculatePriorityScore(contact);
      
      // Determine priority level
      if (contact.priorityScore >= 60) contact.priority = 'high';
      else if (contact.priorityScore >= 30) contact.priority = 'medium';
      else contact.priority = 'low';
      
      enriched++;
    }
    
    this.saveCampaign();
    logger.info(`✨ ${enriched} Kontakte angereichert`);
    
    return { enriched };
  }

  /**
   * Get priority call list
   */
  getPriorityCallList(options = {}) {
    const { limit = 50, minScore = 30, segment = null, hasPhone = false } = options;
    
    let contacts = this.campaign.contacts
      .filter(c => c.priorityScore >= minScore)
      .filter(c => !segment || c.segment === segment)
      .filter(c => !hasPhone || c.telefon);
    
    // Sort by priority score descending
    contacts.sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));
    
    return contacts.slice(0, limit).map(c => ({
      id: c.id,
      name: `${c.vorname} ${c.nachname}`.trim() || c.firma,
      firma: c.firma,
      email: c.email,
      telefon: c.telefon,
      segment: c.segment,
      priority: c.priority,
      priorityScore: c.priorityScore,
      scheduledDate: c.scheduledSlot?.date,
      hasReplied: c.hasReplied || false,
      replySentiment: c.replySentiment,
      replyCategory: c.replyCategory,
      lastReply: c.replies?.[c.replies.length - 1] || null
    }));
  }

  /**
   * Get contacts needing re-engagement (late meetings)
   */
  getReengagementList() {
    return this.campaign.contacts
      .filter(c => c.segment === 'march_late' || c.segment === 'very_late')
      .filter(c => !c.reengagementSentAt)
      .map(c => ({
        id: c.id,
        name: `${c.vorname} ${c.nachname}`.trim() || c.firma,
        firma: c.firma,
        email: c.email,
        segment: c.segment,
        scheduledDate: c.scheduledSlot?.date,
        monthName: this.getMonthName(c.scheduledSlot?.date)
      }));
  }

  getMonthName(dateStr) {
    if (!dateStr) return '';
    const months = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 
                    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
    const month = parseInt(dateStr.split('-')[1]) - 1;
    return months[month] || '';
  }

  /**
   * Mark contact for re-engagement sent
   */
  markReengagementSent(contactId) {
    const idx = this.campaign.contacts.findIndex(c => c.id === contactId);
    if (idx >= 0) {
      this.campaign.contacts[idx].reengagementSentAt = new Date().toISOString();
      this.saveCampaign();
    }
  }
}

export const campaignService = new CampaignService();
export default campaignService;
