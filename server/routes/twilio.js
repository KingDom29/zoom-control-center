/**
 * Twilio Routes
 * SMS, Calls, Webhooks
 */

import express from 'express';
import { twilioService } from '../services/twilioService.js';
import { unifiedContactService } from '../services/unified/unifiedContactService.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Status Check
router.get('/status', async (req, res) => {
  const balance = await twilioService.getBalance();
  res.json({
    configured: twilioService.isConfigured(),
    phoneNumber: process.env.TWILIO_PHONE_NUMBER,
    balance
  });
});

// Phone Capabilities
router.get('/capabilities', async (req, res) => {
  const capabilities = await twilioService.getPhoneCapabilities();
  res.json(capabilities);
});

// Voice Geo Permissions (welche Länder für Anrufe freigeschaltet)
router.get('/permissions/voice', async (req, res) => {
  const permissions = await twilioService.getVoicePermissions();
  res.json(permissions);
});

// SMS Permissions
router.get('/permissions/sms', async (req, res) => {
  const permissions = await twilioService.getSmsPermissions();
  res.json(permissions);
});

// Vollständige Phone Config (inkl. Rufumleitungen)
router.get('/config', async (req, res) => {
  const config = await twilioService.getPhoneConfig();
  res.json(config);
});

// Rufumleitung setzen
router.post('/forwarding', async (req, res) => {
  try {
    const { forwardTo } = req.body;
    if (!forwardTo) {
      return res.status(400).json({ error: 'forwardTo required' });
    }
    const result = await twilioService.setCallForwarding(forwardTo);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Rufumleitung entfernen
router.delete('/forwarding', async (req, res) => {
  try {
    const result = await twilioService.removeCallForwarding();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// TwiML für Weiterleitung
router.all('/twiml/forward', (req, res) => {
  const to = req.query.to || req.body.To;
  
  res.type('text/xml');
  res.send(`
    <?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Dial callerId="${process.env.TWILIO_PHONE_NUMBER}">
        <Number>${to}</Number>
      </Dial>
    </Response>
  `);
});

// SIP Trunk Details
router.get('/trunk/:trunkSid', async (req, res) => {
  const details = await twilioService.getTrunkDetails(req.params.trunkSid);
  res.json(details);
});

// Nummer auf unsere App umstellen (von Trunk trennen)
router.post('/configure-for-app', async (req, res) => {
  try {
    const webhookBaseUrl = req.body.webhookBaseUrl || process.env.PUBLIC_URL || 'https://zoom-control-center-production.up.railway.app';
    const result = await twilioService.configureForApp(webhookBaseUrl);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Aktive Calls
router.get('/calls/active', async (req, res) => {
  const calls = await twilioService.getActiveCalls();
  res.json(calls);
});

// ============================================
// VOICE WEBHOOKS (eingehende Anrufe)
// ============================================

// Eingehender Anruf - Haupthandler
router.post('/voice/incoming', async (req, res) => {
  const { From, To, CallSid, CallStatus } = req.body;
  
  logger.info('📞 Eingehender Anruf', { from: From, to: To, callSid: CallSid });

  // Kontakt in DB suchen
  const contact = unifiedContactService.getContactByPhone?.(From);
  
  if (contact) {
    // Bekannter Kontakt - Interaction loggen
    unifiedContactService.addInteraction(contact.id, {
      type: 'call_received',
      channel: 'phone',
      direction: 'inbound',
      data: { from: From, callSid: CallSid }
    });
  }

  // TwiML Response - Optionen:
  // 1. Direkt weiterleiten an Team
  // 2. IVR Menü
  // 3. Voicemail
  
  res.type('text/xml');
  res.send(`
    <?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Say language="de-DE">Willkommen bei Maklerplan. Bitte warten Sie, wir verbinden Sie.</Say>
      <Dial timeout="30" callerId="${process.env.TWILIO_PHONE_NUMBER}" record="record-from-answer">
        <!-- Hier Team-Nummern eintragen -->
        <Number>+41791234567</Number>
      </Dial>
      <Say language="de-DE">Es konnte leider niemand erreicht werden. Bitte hinterlassen Sie eine Nachricht nach dem Signalton.</Say>
      <Record maxLength="120" transcribe="true" transcribeCallback="/api/twilio/voice/transcription" />
      <Say language="de-DE">Danke für Ihren Anruf. Auf Wiederhören.</Say>
    </Response>
  `);
});

// Fallback wenn Haupthandler fehlschlägt
router.post('/voice/fallback', (req, res) => {
  logger.error('📞 Voice Fallback ausgelöst', req.body);
  
  res.type('text/xml');
  res.send(`
    <?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Say language="de-DE">Es ist ein technischer Fehler aufgetreten. Bitte versuchen Sie es später erneut.</Say>
      <Hangup />
    </Response>
  `);
});

// Call Status Updates
router.post('/voice/status', (req, res) => {
  const { CallSid, CallStatus, CallDuration, From, To } = req.body;
  
  logger.info('📞 Call Status', { callSid: CallSid, status: CallStatus, duration: CallDuration });

  // Bei Anrufende: Contact updaten
  if (CallStatus === 'completed' && CallDuration) {
    const contact = unifiedContactService.getContactByPhone?.(From) || unifiedContactService.getContactByPhone?.(To);
    if (contact) {
      unifiedContactService.addInteraction(contact.id, {
        type: 'call_completed',
        channel: 'phone',
        data: { callSid: CallSid, duration: CallDuration, status: CallStatus }
      });
    }
  }

  res.sendStatus(200);
});

// Voicemail Transcription
router.post('/voice/transcription', (req, res) => {
  const { TranscriptionText, RecordingUrl, From, CallSid } = req.body;
  
  logger.info('📝 Voicemail Transcription', { from: From, text: TranscriptionText });

  // Zendesk Ticket für Voicemail erstellen
  if (TranscriptionText) {
    const contact = unifiedContactService.getContactByPhone?.(From);
    
    // TODO: Zendesk Ticket erstellen
    logger.info('📝 Voicemail von', { 
      from: From, 
      contact: contact?.email,
      text: TranscriptionText,
      recording: RecordingUrl 
    });
  }

  res.sendStatus(200);
});

// ============================================
// NUMMERN KAUFEN
// ============================================

// Alle eigenen Nummern
router.get('/numbers', async (req, res) => {
  const numbers = await twilioService.listOwnedNumbers();
  res.json(numbers);
});

// Verfügbare Nummern suchen
router.get('/numbers/search', async (req, res) => {
  try {
    const { country = 'DE', type, sms, limit } = req.query;
    const result = await twilioService.searchAvailableNumbers(country, {
      type,
      smsRequired: sms === 'true',
      limit: parseInt(limit) || 10
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Nummer kaufen
router.post('/numbers/purchase', async (req, res) => {
  try {
    const { phoneNumber, addressSid } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ error: 'phoneNumber required' });
    }
    const webhookBaseUrl = process.env.PUBLIC_URL || 'https://zoom-control-center-production.up.railway.app';
    
    let result;
    if (addressSid) {
      result = await twilioService.purchaseNumberWithAddress(phoneNumber, addressSid, webhookBaseUrl);
    } else {
      result = await twilioService.purchaseNumber(phoneNumber, webhookBaseUrl);
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Adressen auflisten
router.get('/addresses', async (req, res) => {
  const addresses = await twilioService.listAddresses();
  res.json(addresses);
});

// Regulatory Bundles auflisten
router.get('/bundles', async (req, res) => {
  const bundles = await twilioService.listBundles();
  res.json(bundles);
});

// Nummer mit Bundle kaufen
router.post('/numbers/purchase-with-bundle', async (req, res) => {
  try {
    const { phoneNumber, bundleSid, addressSid } = req.body;
    if (!phoneNumber || !bundleSid) {
      return res.status(400).json({ error: 'phoneNumber and bundleSid required' });
    }
    const webhookBaseUrl = process.env.PUBLIC_URL || 'https://zoom-control-center-production.up.railway.app';
    const result = await twilioService.purchaseNumberWithBundle(phoneNumber, bundleSid, addressSid, webhookBaseUrl);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// SMS
// ============================================

// SMS senden
router.post('/sms/send', async (req, res) => {
  try {
    const { to, message, contactId } = req.body;
    
    let phone = to;
    if (contactId && !to) {
      const contact = unifiedContactService.getContact(contactId);
      phone = contact?.mobile || contact?.phone;
    }

    if (!phone || !message) {
      return res.status(400).json({ error: 'to/contactId and message required' });
    }

    const result = await twilioService.sendSms(phone, message);
    
    // Interaction loggen wenn contactId
    if (contactId && result.success) {
      unifiedContactService.addInteraction(contactId, {
        type: 'sms_sent',
        channel: 'sms',
        direction: 'outbound',
        data: { message: message.substring(0, 100), messageId: result.messageId }
      });
    }

    res.json(result);
  } catch (error) {
    logger.error('SMS Send Fehler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Quick SMS Template
router.post('/sms/quick/:template', async (req, res) => {
  try {
    const { to, contactId, ...data } = req.body;
    
    let phone = to;
    if (contactId && !to) {
      const contact = unifiedContactService.getContact(contactId);
      phone = contact?.mobile || contact?.phone;
    }

    const result = await twilioService.sendQuickSms(phone, req.params.template, data);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Meeting Reminder SMS
router.post('/sms/meeting-reminder', async (req, res) => {
  try {
    const { to, contactId, meeting } = req.body;
    
    let phone = to;
    if (contactId && !to) {
      const contact = unifiedContactService.getContact(contactId);
      phone = contact?.mobile || contact?.phone;
    }

    const result = await twilioService.sendMeetingReminder(phone, meeting);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// SMS History
router.get('/sms/history/:phone', async (req, res) => {
  try {
    const history = await twilioService.getSmsHistory(req.params.phone);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// CALLS
// ============================================

// Call initiieren
router.post('/call/initiate', async (req, res) => {
  try {
    const { to, agentPhone, contactId, record } = req.body;
    
    let customerPhone = to;
    if (contactId && !to) {
      const contact = unifiedContactService.getContact(contactId);
      customerPhone = contact?.mobile || contact?.phone;
    }

    if (!customerPhone || !agentPhone) {
      return res.status(400).json({ error: 'to/contactId and agentPhone required' });
    }

    const result = await twilioService.initiateCall(customerPhone, agentPhone, { record });
    
    if (contactId && result.success) {
      unifiedContactService.addInteraction(contactId, {
        type: 'call_initiated',
        channel: 'phone',
        direction: 'outbound',
        data: { callSid: result.callSid, to: result.to }
      });
    }

    res.json(result);
  } catch (error) {
    logger.error('Call Initiate Fehler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Call Status
router.get('/call/status/:callSid', async (req, res) => {
  try {
    const status = await twilioService.getCallStatus(req.params.callSid);
    res.json(status || { error: 'Call not found' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Recordings
router.get('/call/recordings/:callSid', async (req, res) => {
  try {
    const recordings = await twilioService.getRecordings(req.params.callSid);
    res.json(recordings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// TWILIO WEBHOOKS
// ============================================

// TwiML für Call-Verbindung
router.all('/twiml/connect', (req, res) => {
  const to = req.query.to || req.body.To;
  
  res.type('text/xml');
  res.send(`
    <?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Say language="de-DE">Verbinde Sie jetzt mit dem Kunden.</Say>
      <Dial callerId="${process.env.TWILIO_PHONE_NUMBER}" record="record-from-answer">
        <Number>${to}</Number>
      </Dial>
    </Response>
  `);
});

// Recording Status Webhook
router.post('/recording-status', (req, res) => {
  const { RecordingSid, RecordingUrl, CallSid, RecordingStatus, RecordingDuration } = req.body;
  
  logger.info('📼 Recording Status', {
    callSid: CallSid,
    recordingSid: RecordingSid,
    status: RecordingStatus,
    duration: RecordingDuration,
    url: RecordingUrl
  });

  // Hier könnte man die Recording-URL speichern
  res.sendStatus(200);
});

// SMS Status Webhook
router.post('/sms-status', (req, res) => {
  const { MessageSid, MessageStatus, To, ErrorCode } = req.body;
  
  logger.info('📱 SMS Status', {
    messageSid: MessageSid,
    status: MessageStatus,
    to: To,
    error: ErrorCode
  });

  res.sendStatus(200);
});

// Incoming SMS Webhook
router.post('/incoming-sms', (req, res) => {
  const { From, Body, MessageSid } = req.body;
  
  logger.info('📨 Incoming SMS', {
    from: From,
    body: Body,
    messageSid: MessageSid
  });

  // Kontakt finden und Interaction loggen
  const contact = unifiedContactService.getContactByPhone?.(From);
  if (contact) {
    unifiedContactService.addInteraction(contact.id, {
      type: 'sms_received',
      channel: 'sms',
      direction: 'inbound',
      data: { message: Body, from: From }
    });
  }

  // Auto-Reply (optional)
  res.type('text/xml');
  res.send(`
    <?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Message>Danke für Ihre Nachricht! Wir melden uns in Kürze.</Message>
    </Response>
  `);
});

export default router;
