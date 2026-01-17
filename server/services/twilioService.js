/**
 * Twilio Service
 * SMS und Voice Calls
 */

import twilio from 'twilio';
import logger from '../utils/logger.js';

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

class TwilioService {
  
  constructor() {
    this.client = null;
    this.initialized = false;
  }

  init() {
    if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
      try {
        this.client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
        this.initialized = true;
        logger.info('✅ Twilio Service initialisiert');
      } catch (error) {
        logger.error('Twilio Init Fehler', { error: error.message });
      }
    } else {
      logger.warn('⚠️ Twilio nicht konfiguriert (TWILIO_ACCOUNT_SID/AUTH_TOKEN fehlt)');
    }
  }

  isConfigured() {
    return this.initialized && this.client !== null;
  }

  // ============================================
  // SMS
  // ============================================

  /**
   * SMS senden
   */
  async sendSms(to, message, options = {}) {
    if (!this.isConfigured()) {
      logger.warn('Twilio nicht konfiguriert - SMS nicht gesendet');
      return { success: false, error: 'Twilio not configured', simulated: true };
    }

    // Telefonnummer formatieren
    const formattedTo = this.formatPhoneNumber(to);
    if (!formattedTo) {
      return { success: false, error: 'Invalid phone number' };
    }

    try {
      const result = await this.client.messages.create({
        body: message,
        from: TWILIO_PHONE_NUMBER,
        to: formattedTo
      });

      logger.info('📱 SMS gesendet', { 
        to: formattedTo, 
        messageId: result.sid,
        status: result.status 
      });

      return {
        success: true,
        messageId: result.sid,
        status: result.status,
        to: formattedTo,
        from: TWILIO_PHONE_NUMBER
      };
    } catch (error) {
      logger.error('SMS Fehler', { to, error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Meeting Reminder SMS
   */
  async sendMeetingReminder(to, meeting) {
    const meetingDate = new Date(meeting.startTime || meeting.start_time);
    const dateStr = meetingDate.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
    const timeStr = meetingDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

    const message = `📅 Reminder: Ihr Termin "${meeting.topic}" ist am ${dateStr} um ${timeStr} Uhr. Link: ${meeting.join_url || meeting.joinUrl}`;

    return this.sendSms(to, message);
  }

  /**
   * Quick SMS Templates
   */
  async sendQuickSms(to, template, data = {}) {
    const templates = {
      meeting_reminder_1h: `⏰ In 1 Stunde: ${data.topic}. Link: ${data.joinUrl}`,
      meeting_reminder_24h: `📅 Morgen: ${data.topic} um ${data.time}. Link: ${data.joinUrl}`,
      no_show: `Wir haben Sie vermisst! Neuer Termin? Antworten Sie mit JA.`,
      callback: `Wir haben versucht Sie zu erreichen. Wann passt es Ihnen? Antworten Sie mit Ihrer Wunschzeit.`,
      thank_you: `Danke für das Gespräch! Bei Fragen: ${data.phone || TWILIO_PHONE_NUMBER}`
    };

    const message = templates[template];
    if (!message) {
      return { success: false, error: 'Template not found' };
    }

    return this.sendSms(to, message);
  }

  // ============================================
  // VOICE CALLS
  // ============================================

  /**
   * Outbound Call initiieren (verbindet zwei Nummern)
   */
  async initiateCall(to, agentPhone, options = {}) {
    if (!this.isConfigured()) {
      return { success: false, error: 'Twilio not configured' };
    }

    const formattedTo = this.formatPhoneNumber(to);
    const formattedAgent = this.formatPhoneNumber(agentPhone);

    if (!formattedTo || !formattedAgent) {
      return { success: false, error: 'Invalid phone number' };
    }

    try {
      // TwiML URL für Call-Handling
      const twimlUrl = options.twimlUrl || `${process.env.PUBLIC_URL}/api/twilio/twiml/connect?to=${encodeURIComponent(formattedTo)}`;

      const call = await this.client.calls.create({
        url: twimlUrl,
        to: formattedAgent, // Zuerst den Agent anrufen
        from: TWILIO_PHONE_NUMBER,
        record: options.record !== false, // Default: aufzeichnen
        recordingStatusCallback: `${process.env.PUBLIC_URL}/api/twilio/recording-status`
      });

      logger.info('📞 Call initiiert', { 
        callSid: call.sid, 
        to: formattedTo, 
        agent: formattedAgent 
      });

      return {
        success: true,
        callSid: call.sid,
        status: call.status,
        to: formattedTo,
        agent: formattedAgent
      };
    } catch (error) {
      logger.error('Call Fehler', { to, error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Call Status abrufen
   */
  async getCallStatus(callSid) {
    if (!this.isConfigured()) return null;

    try {
      const call = await this.client.calls(callSid).fetch();
      return {
        sid: call.sid,
        status: call.status,
        duration: call.duration,
        startTime: call.startTime,
        endTime: call.endTime,
        direction: call.direction
      };
    } catch (error) {
      logger.error('Call Status Fehler', { callSid, error: error.message });
      return null;
    }
  }

  /**
   * Recordings abrufen
   */
  async getRecordings(callSid) {
    if (!this.isConfigured()) return [];

    try {
      const recordings = await this.client.recordings.list({ callSid, limit: 10 });
      return recordings.map(r => ({
        sid: r.sid,
        duration: r.duration,
        url: `https://api.twilio.com${r.uri.replace('.json', '.mp3')}`,
        dateCreated: r.dateCreated
      }));
    } catch (error) {
      logger.error('Recordings Fehler', { callSid, error: error.message });
      return [];
    }
  }

  // ============================================
  // HELPERS
  // ============================================

  formatPhoneNumber(phone) {
    if (!phone) return null;

    // Entferne alles außer Zahlen und +
    let cleaned = phone.replace(/[^\d+]/g, '');

    // Deutsche Nummer ohne Ländercode
    if (cleaned.startsWith('0') && !cleaned.startsWith('00')) {
      cleaned = '+49' + cleaned.substring(1);
    }
    // Schweizer Nummer
    else if (cleaned.startsWith('0041')) {
      cleaned = '+41' + cleaned.substring(4);
    }
    // Deutsche Nummer mit 0049
    else if (cleaned.startsWith('0049')) {
      cleaned = '+49' + cleaned.substring(4);
    }
    // Schon mit + 
    else if (!cleaned.startsWith('+')) {
      // Annahme: Deutsche Nummer
      if (cleaned.length >= 10) {
        cleaned = '+49' + cleaned;
      }
    }

    // Validierung: Mindestens 10 Ziffern
    if (cleaned.replace(/\D/g, '').length < 10) {
      return null;
    }

    return cleaned;
  }

  /**
   * SMS History abrufen
   */
  async getSmsHistory(to, limit = 20) {
    if (!this.isConfigured()) return [];

    try {
      const formattedTo = this.formatPhoneNumber(to);
      const messages = await this.client.messages.list({
        to: formattedTo,
        limit
      });

      return messages.map(m => ({
        sid: m.sid,
        body: m.body,
        status: m.status,
        direction: m.direction,
        dateSent: m.dateSent
      }));
    } catch (error) {
      logger.error('SMS History Fehler', { error: error.message });
      return [];
    }
  }

  /**
   * Account Balance
   */
  async getBalance() {
    if (!this.isConfigured()) return null;

    try {
      const balance = await this.client.balance.fetch();
      return {
        balance: balance.balance,
        currency: balance.currency
      };
    } catch (error) {
      logger.error('Balance Fehler', { error: error.message });
      return null;
    }
  }

  /**
   * Geo Permissions für SMS abrufen
   */
  async getSmsPermissions() {
    if (!this.isConfigured()) return null;

    try {
      const permissions = await this.client.messaging.v1.services.list({ limit: 20 });
      
      // Alternativ: Direkt die erlaubten Länder abfragen
      const countries = await this.client.messaging.v1.deactivations.fetch().catch(() => null);
      
      return {
        services: permissions.map(s => ({ sid: s.sid, friendlyName: s.friendlyName })),
        note: 'SMS permissions depend on account settings in Twilio Console'
      };
    } catch (error) {
      logger.error('SMS Permissions Fehler', { error: error.message });
      return { error: error.message };
    }
  }

  /**
   * Geo Permissions für Voice abrufen
   */
  async getVoicePermissions() {
    if (!this.isConfigured()) return null;

    try {
      // Voice Geo Permissions
      const permissions = await this.client.voice.v1.dialingPermissions.countries.list({ limit: 300 });
      
      const enabled = permissions.filter(p => p.lowRiskNumbersEnabled || p.highRiskSpecialNumbersEnabled);
      
      return {
        total: permissions.length,
        enabled: enabled.length,
        countries: enabled.map(p => ({
          code: p.isoCode,
          name: p.name,
          lowRisk: p.lowRiskNumbersEnabled,
          highRisk: p.highRiskSpecialNumbersEnabled,
          highRiskTollFraud: p.highRiskTollfraudNumbersEnabled
        }))
      };
    } catch (error) {
      logger.error('Voice Permissions Fehler', { error: error.message });
      return { error: error.message };
    }
  }

  /**
   * Phone Number Capabilities
   */
  async getPhoneCapabilities() {
    if (!this.isConfigured() || !TWILIO_PHONE_NUMBER) return null;

    try {
      const numbers = await this.client.incomingPhoneNumbers.list({ phoneNumber: TWILIO_PHONE_NUMBER });
      
      if (numbers.length === 0) return { error: 'Phone number not found' };

      const number = numbers[0];
      return {
        phoneNumber: number.phoneNumber,
        friendlyName: number.friendlyName,
        capabilities: number.capabilities,
        smsEnabled: number.capabilities?.sms || false,
        voiceEnabled: number.capabilities?.voice || false,
        mmsEnabled: number.capabilities?.mms || false,
        country: number.phoneNumber.startsWith('+41') ? 'CH' : 
                 number.phoneNumber.startsWith('+49') ? 'DE' : 
                 number.phoneNumber.startsWith('+43') ? 'AT' : 'Unknown'
      };
    } catch (error) {
      logger.error('Phone Capabilities Fehler', { error: error.message });
      return { error: error.message };
    }
  }

  /**
   * Vollständige Phone Number Config inkl. Rufumleitungen
   */
  async getPhoneConfig() {
    if (!this.isConfigured() || !TWILIO_PHONE_NUMBER) return null;

    try {
      const numbers = await this.client.incomingPhoneNumbers.list({ phoneNumber: TWILIO_PHONE_NUMBER });
      
      if (numbers.length === 0) return { error: 'Phone number not found' };

      const n = numbers[0];
      return {
        sid: n.sid,
        phoneNumber: n.phoneNumber,
        friendlyName: n.friendlyName,
        
        // Voice/Call Routing
        voiceUrl: n.voiceUrl,
        voiceMethod: n.voiceMethod,
        voiceFallbackUrl: n.voiceFallbackUrl,
        voiceCallerIdLookup: n.voiceCallerIdLookup,
        voiceApplicationSid: n.voiceApplicationSid,
        
        // SMS Routing
        smsUrl: n.smsUrl,
        smsMethod: n.smsMethod,
        smsFallbackUrl: n.smsFallbackUrl,
        smsApplicationSid: n.smsApplicationSid,
        
        // Status Callbacks
        statusCallback: n.statusCallback,
        statusCallbackMethod: n.statusCallbackMethod,
        
        // Trunk (SIP)
        trunkSid: n.trunkSid,
        
        // Emergency
        emergencyStatus: n.emergencyStatus,
        emergencyAddressSid: n.emergencyAddressSid,
        
        // Forwarding Analysis
        hasVoiceForwarding: !!n.voiceUrl || !!n.voiceApplicationSid || !!n.trunkSid,
        hasSmsForwarding: !!n.smsUrl || !!n.smsApplicationSid,
        
        dateCreated: n.dateCreated,
        dateUpdated: n.dateUpdated
      };
    } catch (error) {
      logger.error('Phone Config Fehler', { error: error.message });
      return { error: error.message };
    }
  }

  /**
   * Rufumleitung setzen
   */
  async setCallForwarding(forwardTo) {
    if (!this.isConfigured() || !TWILIO_PHONE_NUMBER) return null;

    try {
      const numbers = await this.client.incomingPhoneNumbers.list({ phoneNumber: TWILIO_PHONE_NUMBER });
      if (numbers.length === 0) return { error: 'Phone number not found' };

      const formattedTo = this.formatPhoneNumber(forwardTo);
      if (!formattedTo) return { error: 'Invalid forward number' };

      // TwiML Bin URL oder direkte Weiterleitung
      const twimlUrl = `${process.env.PUBLIC_URL}/api/twilio/twiml/forward?to=${encodeURIComponent(formattedTo)}`;

      const updated = await this.client.incomingPhoneNumbers(numbers[0].sid).update({
        voiceUrl: twimlUrl,
        voiceMethod: 'POST'
      });

      logger.info('📞 Rufumleitung gesetzt', { forwardTo: formattedTo });

      return {
        success: true,
        phoneNumber: updated.phoneNumber,
        forwardTo: formattedTo,
        voiceUrl: updated.voiceUrl
      };
    } catch (error) {
      logger.error('Rufumleitung Fehler', { error: error.message });
      return { error: error.message };
    }
  }

  /**
   * Rufumleitung entfernen
   */
  async removeCallForwarding() {
    if (!this.isConfigured() || !TWILIO_PHONE_NUMBER) return null;

    try {
      const numbers = await this.client.incomingPhoneNumbers.list({ phoneNumber: TWILIO_PHONE_NUMBER });
      if (numbers.length === 0) return { error: 'Phone number not found' };

      const updated = await this.client.incomingPhoneNumbers(numbers[0].sid).update({
        voiceUrl: '',
        voiceMethod: 'POST'
      });

      logger.info('📞 Rufumleitung entfernt');

      return {
        success: true,
        phoneNumber: updated.phoneNumber,
        voiceUrl: updated.voiceUrl
      };
    } catch (error) {
      logger.error('Rufumleitung entfernen Fehler', { error: error.message });
      return { error: error.message };
    }
  }

  /**
   * SIP Trunk Details abrufen
   */
  async getTrunkDetails(trunkSid) {
    if (!this.isConfigured()) return null;

    try {
      const trunk = await this.client.trunking.v1.trunks(trunkSid).fetch();
      
      // Origination URIs (wohin Anrufe gehen)
      const originationUris = await this.client.trunking.v1
        .trunks(trunkSid)
        .originationUrls.list();

      // Phone Numbers die diesem Trunk zugewiesen sind
      const phoneNumbers = await this.client.trunking.v1
        .trunks(trunkSid)
        .phoneNumbers.list();

      return {
        sid: trunk.sid,
        friendlyName: trunk.friendlyName,
        domainName: trunk.domainName,
        recording: trunk.recording,
        secure: trunk.secure,
        authType: trunk.authType,
        authTypeSet: trunk.authTypeSet,
        
        originationUris: originationUris.map(o => ({
          sid: o.sid,
          uri: o.sipUrl,
          weight: o.weight,
          priority: o.priority,
          enabled: o.enabled,
          friendlyName: o.friendlyName
        })),
        
        phoneNumbers: phoneNumbers.map(p => ({
          sid: p.sid,
          phoneNumber: p.phoneNumber,
          friendlyName: p.friendlyName
        })),
        
        dateCreated: trunk.dateCreated,
        dateUpdated: trunk.dateUpdated
      };
    } catch (error) {
      logger.error('Trunk Details Fehler', { trunkSid, error: error.message });
      return { error: error.message };
    }
  }

  /**
   * Nummer von Trunk trennen und auf unsere App umstellen
   */
  async configureForApp(webhookBaseUrl) {
    if (!this.isConfigured() || !TWILIO_PHONE_NUMBER) return null;

    try {
      const numbers = await this.client.incomingPhoneNumbers.list({ phoneNumber: TWILIO_PHONE_NUMBER });
      if (numbers.length === 0) return { error: 'Phone number not found' };

      const numberSid = numbers[0].sid;
      const currentTrunkSid = numbers[0].trunkSid;

      // 1. Von Trunk trennen (wenn vorhanden)
      if (currentTrunkSid) {
        try {
          await this.client.trunking.v1
            .trunks(currentTrunkSid)
            .phoneNumbers(numberSid)
            .remove();
          logger.info('📞 Nummer von Trunk getrennt', { trunkSid: currentTrunkSid });
        } catch (e) {
          logger.warn('Trunk Trennung fehlgeschlagen (evtl. nicht verknüpft)', { error: e.message });
        }
      }

      // 2. Webhooks auf unsere App setzen
      const updated = await this.client.incomingPhoneNumbers(numberSid).update({
        voiceUrl: `${webhookBaseUrl}/api/twilio/voice/incoming`,
        voiceMethod: 'POST',
        voiceFallbackUrl: `${webhookBaseUrl}/api/twilio/voice/fallback`,
        voiceFallbackMethod: 'POST',
        statusCallback: `${webhookBaseUrl}/api/twilio/voice/status`,
        statusCallbackMethod: 'POST',
        smsUrl: `${webhookBaseUrl}/api/twilio/incoming-sms`,
        smsMethod: 'POST',
        smsFallbackUrl: '',
        trunkSid: null // Explizit Trunk entfernen
      });

      logger.info('✅ Nummer auf App konfiguriert', { webhookBaseUrl });

      return {
        success: true,
        phoneNumber: updated.phoneNumber,
        voiceUrl: updated.voiceUrl,
        smsUrl: updated.smsUrl,
        previousTrunkSid: currentTrunkSid
      };
    } catch (error) {
      logger.error('App Config Fehler', { error: error.message });
      return { error: error.message };
    }
  }

  /**
   * Alle aktiven Calls abrufen
   */
  async getActiveCalls() {
    if (!this.isConfigured()) return [];

    try {
      const calls = await this.client.calls.list({ status: 'in-progress', limit: 20 });
      return calls.map(c => ({
        sid: c.sid,
        from: c.from,
        to: c.to,
        status: c.status,
        direction: c.direction,
        startTime: c.startTime,
        duration: c.duration
      }));
    } catch (error) {
      logger.error('Active Calls Fehler', { error: error.message });
      return [];
    }
  }
}

export const twilioService = new TwilioService();

// Auto-Init
twilioService.init();
