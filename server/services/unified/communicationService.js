/**
 * Unified Communication Service
 * Alle Kommunikationskanäle: E-Mail, SMS, Phone, WhatsApp, Zoom Meetings
 */

import crypto from 'crypto';
import { emailService } from '../emailService.js';
import { zoomApi } from '../zoomAuth.js';
import { zendeskService } from '../zendeskService.js';
import { brandingService, BRANDS } from './brandingService.js';
import { unifiedContactService, CHANNELS } from './unifiedContactService.js';
import logger from '../../utils/logger.js';

// Token Storage für Tracking
const trackingTokens = new Map();

class CommunicationService {

  // ============================================
  // TOKEN & TRACKING
  // ============================================

  generateTrackingToken(contactId, action, brand = 'maklerplan') {
    const token = crypto.randomBytes(16).toString('hex');
    trackingTokens.set(token, {
      contactId,
      action,
      brand,
      createdAt: new Date().toISOString()
    });
    return token;
  }

  getTrackingUrl(contactId, action, brand = 'maklerplan') {
    const token = this.generateTrackingToken(contactId, action, brand);
    const baseUrl = process.env.PUBLIC_URL || 'http://localhost:3001';
    return `${baseUrl}/api/unified/track/${action}/${token}`;
  }

  resolveToken(token) {
    return trackingTokens.get(token);
  }

  // ============================================
  // E-MAIL
  // ============================================

  /**
   * E-Mail senden mit automatischem Branding
   */
  async sendEmail(contactId, options) {
    const contact = unifiedContactService.getContact(contactId);
    if (!contact) throw new Error('Contact not found');
    if (contact.optedOut) throw new Error('Contact has opted out');

    const brand = brandingService.getBrand(options.brand || contact.activeBrand);
    const emailConfig = brandingService.getEmailConfig(brand.id);

    // Tracking URLs generieren
    const trackingUrls = {
      optout: this.getTrackingUrl(contactId, 'optout', brand.id),
      click: this.getTrackingUrl(contactId, 'click', brand.id),
      open: this.getTrackingUrl(contactId, 'open', brand.id)
    };

    // Personalisierung
    let html = options.html || '';
    html = html
      .replace(/\{\{firstName\}\}/g, contact.firstName || 'there')
      .replace(/\{\{lastName\}\}/g, contact.lastName || '')
      .replace(/\{\{company\}\}/g, contact.company || '')
      .replace(/\{\{email\}\}/g, contact.email)
      .replace(/\{\{optout_url\}\}/g, trackingUrls.optout);

    // Mit Branding wrappen
    const wrappedHtml = brandingService.wrapEmail(brand.id, html)
      .replace(/\{\{optout_url\}\}/g, trackingUrls.optout);

    // Senden
    await emailService.sendEmail({
      to: contact.email,
      from: emailConfig.from,
      fromName: options.fromName || emailConfig.fromName,
      subject: options.subject,
      html: wrappedHtml
    });

    // Interaction loggen
    unifiedContactService.addInteraction(contactId, {
      type: 'email_sent',
      channel: CHANNELS.EMAIL,
      brand: brand.id,
      direction: 'outbound',
      data: {
        subject: options.subject,
        templateId: options.templateId
      }
    });

    logger.info('Email sent', { contactId, brand: brand.id, subject: options.subject });
    return { success: true, contactId, brand: brand.id };
  }

  /**
   * Sequenz-E-Mail senden
   */
  async sendSequenceEmail(contactId, sequenceId, stepIndex, template) {
    return this.sendEmail(contactId, {
      subject: template.subject,
      html: template.html,
      templateId: `${sequenceId}_step_${stepIndex}`
    });
  }

  // ============================================
  // SMS
  // ============================================

  /**
   * SMS senden (via Twilio oder andere Provider)
   */
  async sendSms(contactId, options) {
    const contact = unifiedContactService.getContact(contactId);
    if (!contact) throw new Error('Contact not found');
    if (!contact.mobile && !contact.phone) throw new Error('No phone number');
    if (!contact.preferences?.sms) throw new Error('SMS not allowed for this contact');

    const phone = contact.mobile || contact.phone;
    const brand = brandingService.getBrand(options.brand || contact.activeBrand);

    // TODO: Twilio Integration
    // const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
    // await twilioClient.messages.create({
    //   body: options.message,
    //   from: process.env.TWILIO_PHONE,
    //   to: phone
    // });

    // Für jetzt: Loggen und Zendesk Ticket
    logger.info('SMS would be sent', { contactId, phone, message: options.message });

    // Interaction loggen
    unifiedContactService.addInteraction(contactId, {
      type: 'sms_sent',
      channel: CHANNELS.SMS,
      brand: brand.id,
      direction: 'outbound',
      data: {
        phone,
        message: options.message?.substring(0, 100)
      }
    });

    return { success: true, contactId, phone, simulated: true };
  }

  /**
   * SMS Reminder vor Meeting
   */
  async sendMeetingReminder(contactId, meeting, hoursBeforeBoolean) {
    const contact = unifiedContactService.getContact(contactId);
    if (!contact?.preferences?.sms) return { skipped: true, reason: 'sms_not_allowed' };

    const message = `Reminder: Ihr Termin "${meeting.topic}" startet in ${hoursBeforeBoolean}h. Link: ${meeting.join_url}`;
    
    return this.sendSms(contactId, { message });
  }

  // ============================================
  // PHONE
  // ============================================

  /**
   * Anruf loggen
   */
  async logPhoneCall(contactId, options) {
    const contact = unifiedContactService.getContact(contactId);
    if (!contact) throw new Error('Contact not found');

    const brand = brandingService.getBrand(options.brand || contact.activeBrand);

    // Interaction loggen
    unifiedContactService.addInteraction(contactId, {
      type: 'phone_call',
      channel: CHANNELS.PHONE,
      brand: brand.id,
      direction: options.direction || 'outbound',
      data: {
        duration: options.duration,
        outcome: options.outcome, // answered, voicemail, no_answer, busy
        notes: options.notes,
        calledBy: options.calledBy
      }
    });

    // Stage ggf. updaten
    if (options.outcome === 'answered' && contact.stage === 'lead') {
      unifiedContactService.updateStage(contactId, 'contacted', 'Phone call answered');
    }

    logger.info('Phone call logged', { contactId, outcome: options.outcome });
    return { success: true, contactId };
  }

  /**
   * Rückruf-Aufgabe erstellen (Zendesk)
   */
  async createCallbackTask(contactId, options = {}) {
    const contact = unifiedContactService.getContact(contactId);
    if (!contact) throw new Error('Contact not found');

    const brand = brandingService.getBrand(contact.activeBrand);

    await zendeskService.createTicket({
      subject: `📞 Rückruf: ${contact.company || contact.firstName} ${contact.lastName}`,
      description: `
        <h2>Rückruf erforderlich</h2>
        <p><strong>Kontakt:</strong> ${contact.firstName} ${contact.lastName}</p>
        <p><strong>Firma:</strong> ${contact.company || '-'}</p>
        <p><strong>Telefon:</strong> ${contact.phone || contact.mobile || '-'}</p>
        <p><strong>E-Mail:</strong> ${contact.email}</p>
        <p><strong>Grund:</strong> ${options.reason || 'Kein Grund angegeben'}</p>
        <p><strong>Brand:</strong> ${brand.name}</p>
      `,
      priority: options.urgent ? 'urgent' : 'high',
      type: 'task',
      tags: ['callback', brand.id],
      requesterEmail: contact.email,
      requesterName: `${contact.firstName} ${contact.lastName}`
    });

    unifiedContactService.addInteraction(contactId, {
      type: 'callback_created',
      channel: CHANNELS.ZENDESK_TICKET,
      brand: brand.id,
      data: { reason: options.reason }
    });

    return { success: true, contactId };
  }

  // ============================================
  // ZOOM MEETINGS
  // ============================================

  /**
   * Meeting erstellen für Kontakt
   */
  async createMeeting(contactId, options) {
    const contact = unifiedContactService.getContact(contactId);
    if (!contact) throw new Error('Contact not found');

    const brand = brandingService.getBrand(options.brand || contact.activeBrand);
    const hostId = options.hostId || 'me';

    const meeting = await zoomApi('POST', `/users/${hostId}/meetings`, {
      topic: options.topic || `${brand.name} - ${contact.company || contact.firstName}`,
      type: 2, // Scheduled
      start_time: options.startTime,
      duration: options.duration || 30,
      timezone: options.timezone || 'Europe/Berlin',
      agenda: options.agenda || `Meeting mit ${contact.firstName} ${contact.lastName}`,
      settings: {
        host_video: true,
        participant_video: true,
        join_before_host: false,
        mute_upon_entry: true,
        auto_recording: options.autoRecording || 'cloud',
        registrants_email_notification: true
      }
    });

    // Contact updaten
    const contactData = unifiedContactService.getContact(contactId);
    contactData.zoomMeetings.push(meeting.id);
    unifiedContactService.updateStage(contactId, 'meeting_scheduled', 'Meeting created');

    // Interaction loggen
    unifiedContactService.addInteraction(contactId, {
      type: 'meeting_scheduled',
      channel: CHANNELS.ZOOM_MEETING,
      brand: brand.id,
      data: {
        meetingId: meeting.id,
        topic: meeting.topic,
        startTime: meeting.start_time,
        joinUrl: meeting.join_url
      }
    });

    logger.info('Meeting created', { contactId, meetingId: meeting.id });
    
    return {
      success: true,
      contactId,
      meeting: {
        id: meeting.id,
        topic: meeting.topic,
        startTime: meeting.start_time,
        joinUrl: meeting.join_url,
        hostJoinUrl: meeting.start_url
      }
    };
  }

  /**
   * Meeting-Einladung senden
   */
  async sendMeetingInvitation(contactId, meeting, options = {}) {
    const contact = unifiedContactService.getContact(contactId);
    const brand = brandingService.getBrand(contact.activeBrand);

    const meetingDate = new Date(meeting.startTime || meeting.start_time);
    
    const html = `
      <h1 style="color: ${brand.colors.primary};">📅 Ihr Termin ist bestätigt!</h1>
      
      <p>Hallo ${contact.firstName || 'there'},</p>
      
      <p>wir freuen uns auf unser Gespräch!</p>
      
      <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${brand.colors.primary};">
        <h2 style="margin-top: 0;">${meeting.topic}</h2>
        <p><strong>📆 Datum:</strong> ${meetingDate.toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        <p><strong>🕐 Uhrzeit:</strong> ${meetingDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr</p>
        <p><strong>⏱️ Dauer:</strong> ca. ${meeting.duration} Minuten</p>
      </div>
      
      ${brandingService.getButton(brand.id, '🎥 Am Meeting teilnehmen', meeting.joinUrl || meeting.join_url)}
      
      <p style="margin-top: 30px; color: #666;">
        💡 <strong>Tipp:</strong> Fügen Sie den Termin zu Ihrem Kalender hinzu und testen Sie vorher kurz Kamera & Mikrofon.
      </p>
    `;

    return this.sendEmail(contactId, {
      subject: `📅 Termin bestätigt: ${meeting.topic}`,
      html,
      brand: brand.id
    });
  }

  /**
   * Meeting abgeschlossen verarbeiten
   */
  async processMeetingCompleted(meetingId, contactId) {
    const contact = unifiedContactService.getContact(contactId);
    if (!contact) return { skipped: true, reason: 'contact_not_found' };

    // Stage updaten
    unifiedContactService.updateStage(contactId, 'meeting_done', 'Meeting completed');

    // Interaction loggen
    unifiedContactService.addInteraction(contactId, {
      type: 'meeting_completed',
      channel: CHANNELS.ZOOM_MEETING,
      brand: contact.activeBrand,
      data: { meetingId }
    });

    // Follow-Up E-Mail
    const brand = brandingService.getBrand(contact.activeBrand);
    
    const html = `
      <h1 style="color: ${brand.colors.primary};">✅ Danke für das Gespräch!</h1>
      
      <p>Hallo ${contact.firstName || 'there'},</p>
      
      <p>vielen Dank für Ihre Zeit heute. Es war toll, Sie kennenzulernen!</p>
      
      <h3>🎯 Nächste Schritte:</h3>
      <p>Wir werden uns in den nächsten Tagen mit weiteren Informationen bei Ihnen melden.</p>
      
      <p>Bei Fragen können Sie jederzeit auf diese E-Mail antworten oder uns direkt kontaktieren.</p>
      
      <p style="margin-top: 30px;">
        Mit freundlichen Grüßen,<br>
        <strong>Ihr ${brand.name} Team</strong>
      </p>
    `;

    await this.sendEmail(contactId, {
      subject: `✅ Danke für das Gespräch!`,
      html,
      brand: brand.id
    });

    return { success: true, contactId };
  }

  // ============================================
  // BULK OPERATIONS
  // ============================================

  /**
   * Bulk E-Mail senden
   */
  async sendBulkEmail(contactIds, template, options = {}) {
    const results = { sent: 0, failed: 0, skipped: 0, errors: [] };

    for (const contactId of contactIds) {
      try {
        const contact = unifiedContactService.getContact(contactId);
        if (!contact || contact.optedOut) {
          results.skipped++;
          continue;
        }

        await this.sendEmail(contactId, {
          subject: template.subject,
          html: template.html,
          brand: options.brand || contact.activeBrand
        });
        
        results.sent++;
        
        // Rate limiting
        await new Promise(r => setTimeout(r, options.delay || 1000));
      } catch (error) {
        results.failed++;
        results.errors.push({ contactId, error: error.message });
      }
    }

    logger.info('Bulk email completed', results);
    return results;
  }

  // ============================================
  // STATISTICS
  // ============================================

  getChannelStats() {
    const allContacts = unifiedContactService.findContacts({}).contacts;
    
    return {
      email: {
        totalSent: allContacts.reduce((sum, c) => sum + (c.emailsSent || 0), 0),
        totalOpened: allContacts.reduce((sum, c) => sum + (c.emailsOpened || 0), 0),
        totalClicked: allContacts.reduce((sum, c) => sum + (c.emailsClicked || 0), 0)
      },
      meetings: {
        totalScheduled: allContacts.reduce((sum, c) => sum + (c.zoomMeetings?.length || 0), 0),
        contactsWithMeeting: allContacts.filter(c => c.lastMeetingAt).length
      },
      sms: {
        enabled: allContacts.filter(c => c.preferences?.sms).length
      },
      phone: {
        withPhone: allContacts.filter(c => c.phone || c.mobile).length
      }
    };
  }
}

export const communicationService = new CommunicationService();
