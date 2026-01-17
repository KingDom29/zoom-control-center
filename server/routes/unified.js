/**
 * Unified CRM API Routes
 */

import express from 'express';
import {
  unifiedContactService,
  communicationService,
  pipelineService,
  brandingService,
  callManagerService,
  teamAssignmentService,
  actionEngineService,
  STAGES,
  SOURCES,
  SEQUENCE_TEMPLATES,
  PRIORITY
} from '../services/unified/index.js';
import logger from '../utils/logger.js';

const router = express.Router();

// ============================================
// CONTACTS
// ============================================

// Alle Kontakte (mit Filtern)
router.get('/contacts', (req, res) => {
  try {
    const filters = {
      stage: req.query.stage,
      source: req.query.source,
      brand: req.query.brand,
      branch: req.query.branch,
      tag: req.query.tag,
      search: req.query.search,
      limit: parseInt(req.query.limit) || 100,
      offset: parseInt(req.query.offset) || 0
    };
    const result = unifiedContactService.findContacts(filters);
    res.json(result);
  } catch (error) {
    logger.error('Contacts Fehler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Einzelner Kontakt
router.get('/contacts/:id', (req, res) => {
  const contact = unifiedContactService.getContact(req.params.id);
  if (!contact) return res.status(404).json({ error: 'Contact not found' });
  
  const interactions = unifiedContactService.getInteractions(req.params.id, 20);
  res.json({ contact, interactions });
});

// Kontakt nach E-Mail
router.get('/contacts/email/:email', (req, res) => {
  const contact = unifiedContactService.getContactByEmail(req.params.email);
  if (!contact) return res.status(404).json({ error: 'Contact not found' });
  res.json(contact);
});

// Kontakt erstellen/aktualisieren
router.post('/contacts', (req, res) => {
  try {
    const contact = unifiedContactService.upsertContact(req.body);
    res.json(contact);
  } catch (error) {
    logger.error('Contact upsert Fehler', { error: error.message });
    res.status(400).json({ error: error.message });
  }
});

// Stage ändern
router.put('/contacts/:id/stage', (req, res) => {
  try {
    const { stage, reason } = req.body;
    const contact = unifiedContactService.updateStage(req.params.id, stage, reason);
    res.json(contact);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Opt-Out
router.post('/contacts/:id/optout', (req, res) => {
  try {
    const contact = unifiedContactService.optOut(req.params.id, req.body.reason);
    res.json(contact);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ============================================
// COMMUNICATION
// ============================================

// E-Mail senden
router.post('/send/email', async (req, res) => {
  try {
    const { contactId, subject, html, brand } = req.body;
    const result = await communicationService.sendEmail(contactId, { subject, html, brand });
    res.json(result);
  } catch (error) {
    logger.error('Email senden Fehler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// SMS senden
router.post('/send/sms', async (req, res) => {
  try {
    const { contactId, message } = req.body;
    const result = await communicationService.sendSms(contactId, { message });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Anruf loggen
router.post('/log/call', async (req, res) => {
  try {
    const { contactId, duration, outcome, notes, calledBy, direction } = req.body;
    const result = await communicationService.logPhoneCall(contactId, { duration, outcome, notes, calledBy, direction });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Rückruf-Aufgabe
router.post('/task/callback', async (req, res) => {
  try {
    const { contactId, reason, urgent } = req.body;
    const result = await communicationService.createCallbackTask(contactId, { reason, urgent });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Meeting erstellen
router.post('/meeting', async (req, res) => {
  try {
    const { contactId, topic, startTime, duration, hostId } = req.body;
    const result = await communicationService.createMeeting(contactId, { topic, startTime, duration, hostId });
    res.json(result);
  } catch (error) {
    logger.error('Meeting erstellen Fehler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Meeting-Einladung senden
router.post('/meeting/invite', async (req, res) => {
  try {
    const { contactId, meeting } = req.body;
    const result = await communicationService.sendMeetingInvitation(contactId, meeting);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// SEQUENCES & PIPELINE
// ============================================

// Alle Sequenz-Templates
router.get('/sequences/templates', (req, res) => {
  res.json(SEQUENCE_TEMPLATES);
});

// Sequenz starten
router.post('/sequences/start', (req, res) => {
  try {
    const { contactId, sequenceId } = req.body;
    const sequence = pipelineService.startSequence(contactId, sequenceId);
    res.json(sequence);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Sequenz stoppen
router.post('/sequences/:id/stop', (req, res) => {
  try {
    const result = pipelineService.stopSequence(req.params.id, req.body.reason);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Sequenzen verarbeiten (manuell)
router.post('/sequences/process', async (req, res) => {
  try {
    const result = await pipelineService.processSequences();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// TRACKING
// ============================================

// Click/Open Tracking
router.get('/track/:action/:token', async (req, res) => {
  try {
    const { action, token } = req.params;
    const data = communicationService.resolveToken(token);
    
    if (!data) {
      return res.redirect('https://maklerplan.com');
    }

    const { contactId, brand } = data;
    const brandConfig = brandingService.getBrand(brand);

    // Interaction loggen
    if (action === 'open') {
      unifiedContactService.addInteraction(contactId, {
        type: 'email_opened',
        channel: 'email',
        brand
      });
      // 1x1 Pixel zurückgeben
      const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
      res.set('Content-Type', 'image/gif');
      return res.send(pixel);
    }

    if (action === 'click') {
      unifiedContactService.addInteraction(contactId, {
        type: 'email_clicked',
        channel: 'email',
        brand
      });
      // Stage updaten wenn noch Lead
      const contact = unifiedContactService.getContact(contactId);
      if (contact && contact.stage === 'lead') {
        unifiedContactService.updateStage(contactId, 'contacted', 'Email clicked');
      }
      return res.redirect(brandConfig.bookingUrl);
    }

    if (action === 'optout') {
      unifiedContactService.optOut(contactId, 'email_link');
      // Sequenz stoppen
      const contact = unifiedContactService.getContact(contactId);
      if (contact?.activeSequence) {
        pipelineService.stopSequence(contact.activeSequence, 'opted_out');
      }
      return res.send(`
        <html>
        <head><title>Abgemeldet</title></head>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
          <h1>✅ Sie wurden erfolgreich abgemeldet</h1>
          <p>Sie erhalten keine weiteren E-Mails von uns.</p>
        </body>
        </html>
      `);
    }

    res.redirect(brandConfig.website);
  } catch (error) {
    logger.error('Tracking Fehler', { error: error.message });
    res.redirect('https://maklerplan.com');
  }
});

// ============================================
// STATISTICS
// ============================================

router.get('/stats', (req, res) => {
  res.json({
    contacts: unifiedContactService.getStats(),
    pipeline: pipelineService.getPipelineStats(),
    sequences: pipelineService.getSequenceStats(),
    communication: communicationService.getChannelStats()
  });
});

router.get('/stats/pipeline', (req, res) => {
  res.json(pipelineService.getPipelineStats());
});

// ============================================
// BRANDS
// ============================================

router.get('/brands', (req, res) => {
  res.json(brandingService.getAllBrands().map(b => ({
    id: b.id,
    name: b.name,
    fromEmail: b.fromEmail,
    colors: b.colors
  })));
});

// ============================================
// MIGRATION
// ============================================

router.post('/migrate', async (req, res) => {
  try {
    const { source, contacts } = req.body;
    const result = await unifiedContactService.migrateFromLegacy(source, contacts);
    res.json(result);
  } catch (error) {
    logger.error('Migration Fehler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// BULK OPERATIONS
// ============================================

router.post('/bulk/email', async (req, res) => {
  try {
    const { contactIds, template, brand } = req.body;
    const result = await communicationService.sendBulkEmail(contactIds, template, { brand });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// CALL MANAGER
// ============================================

// Einzelnen Kontakt analysieren
router.get('/call-manager/analyze/:contactId', async (req, res) => {
  try {
    const analysis = await callManagerService.analyzeContact(req.params.contactId);
    if (!analysis) return res.status(404).json({ error: 'Contact not found' });
    res.json(analysis);
  } catch (error) {
    logger.error('Call Analyse Fehler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Tägliche Anruf-Liste generieren
router.get('/call-manager/list', async (req, res) => {
  try {
    const options = {
      limit: parseInt(req.query.limit) || 20,
      brand: req.query.brand,
      minPriority: req.query.minPriority || PRIORITY.LOW
    };
    const callList = await callManagerService.generateCallList(options);
    res.json(callList);
  } catch (error) {
    logger.error('Call List Fehler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Zendesk Tasks für Anrufe erstellen
router.post('/call-manager/create-tasks', async (req, res) => {
  try {
    const callList = await callManagerService.generateCallList({ 
      limit: req.body.limit || 10,
      minPriority: PRIORITY.HIGH 
    });
    const result = await callManagerService.createCallTasks(callList);
    res.json({ ...result, callList });
  } catch (error) {
    logger.error('Call Tasks Fehler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// SMS über Zendesk senden
router.post('/send/sms-zendesk', async (req, res) => {
  try {
    const { contactId, message } = req.body;
    if (!contactId || !message) {
      return res.status(400).json({ error: 'contactId and message required' });
    }
    const result = await callManagerService.sendSmsViaZendesk(contactId, message);
    res.json(result);
  } catch (error) {
    logger.error('SMS Zendesk Fehler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// WhatsApp über Zendesk senden
router.post('/send/whatsapp-zendesk', async (req, res) => {
  try {
    const { contactId, message } = req.body;
    if (!contactId || !message) {
      return res.status(400).json({ error: 'contactId and message required' });
    }
    const result = await callManagerService.sendWhatsAppViaZendesk(contactId, message);
    res.json(result);
  } catch (error) {
    logger.error('WhatsApp Zendesk Fehler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// TEAM ASSIGNMENT
// ============================================

// Team-Mitglieder (von Zoom)
router.get('/team', async (req, res) => {
  try {
    const members = await teamAssignmentService.getTeamMembers(req.query.refresh === 'true');
    res.json(members);
  } catch (error) {
    logger.error('Team Members Fehler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Team-Member Einstellungen
router.put('/team/:memberId/settings', (req, res) => {
  try {
    teamAssignmentService.updateMemberSettings(req.params.memberId, req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Kontakt zuweisen
router.post('/team/assign', async (req, res) => {
  try {
    const { contactId, memberId, reason } = req.body;
    const result = await teamAssignmentService.assignContact(contactId, memberId, reason);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Auto-Zuweisung
router.post('/team/auto-assign/:contactId', async (req, res) => {
  try {
    const member = await teamAssignmentService.autoAssignContact(req.params.contactId);
    res.json({ success: !!member, member });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Team-Empfehlungen generieren
router.get('/team/recommendations', async (req, res) => {
  try {
    const recommendations = await teamAssignmentService.generateTeamRecommendations();
    res.json(recommendations);
  } catch (error) {
    logger.error('Recommendations Fehler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Empfehlungs-E-Mails senden (manuell)
router.post('/team/send-recommendations', async (req, res) => {
  try {
    const result = await teamAssignmentService.sendDailyRecommendations();
    res.json(result);
  } catch (error) {
    logger.error('Send Recommendations Fehler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Team Stats
router.get('/team/stats', async (req, res) => {
  try {
    const stats = await teamAssignmentService.getTeamStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ACTION ENGINE - One-Click Actions + Learning
// ============================================

// Learning Stats & Gewichte
router.get('/learning/stats', (req, res) => {
  res.json(actionEngineService.getLearningStats());
});

// Gewicht anpassen
router.put('/learning/weight/:reason', (req, res) => {
  try {
    const { weight } = req.body;
    actionEngineService.setWeight(req.params.reason, parseInt(weight));
    res.json({ success: true, weights: actionEngineService.getWeights() });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Feedback für Empfehlung geben
router.post('/learning/feedback', (req, res) => {
  try {
    const feedback = actionEngineService.submitFeedback(req.body);
    res.json(feedback);
  } catch (error) {
    logger.error('Feedback Fehler', { error: error.message });
    res.status(400).json({ error: error.message });
  }
});

// ONE-CLICK: Termin-Vorschläge senden
router.post('/action/send-meeting-proposal/:contactId', async (req, res) => {
  try {
    const result = await actionEngineService.sendMeetingProposal(req.params.contactId, req.body);
    res.json(result);
  } catch (error) {
    logger.error('Meeting Proposal Fehler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// ONE-CLICK: Post-Call Actions (alles automatisch)
router.post('/action/post-call/:contactId', async (req, res) => {
  try {
    const result = await actionEngineService.executePostCallActions(req.params.contactId, req.body);
    res.json(result);
  } catch (error) {
    logger.error('Post-Call Actions Fehler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Slot buchen (von Termin-Vorschlag E-Mail)
router.get('/book-slot', async (req, res) => {
  try {
    const { contactId, date, brand } = req.query;
    const contact = unifiedContactService.getContact(contactId);
    
    if (!contact) {
      return res.send('<h1>Fehler</h1><p>Kontakt nicht gefunden</p>');
    }

    // Meeting erstellen
    const meetingDate = new Date(date);
    const brandConfig = brandingService.getBrand(brand || contact.activeBrand);

    const meeting = await require('../zoomAuth.js').zoomApi('POST', '/users/me/meetings', {
      topic: `${brandConfig.name} - ${contact.company || contact.firstName}`,
      type: 2,
      start_time: meetingDate.toISOString(),
      duration: 30,
      timezone: 'Europe/Berlin',
      settings: { auto_recording: 'cloud' }
    });

    // Stage updaten
    unifiedContactService.updateStage(contactId, STAGES.MEETING_SCHEDULED, 'Slot selected by contact');

    // Bestätigungs-E-Mail
    await communicationService.sendMeetingInvitation(contactId, {
      topic: meeting.topic,
      startTime: meeting.start_time,
      duration: meeting.duration,
      joinUrl: meeting.join_url
    });

    res.send(`
      <html>
      <head><title>Termin bestätigt!</title></head>
      <body style="font-family: Arial; text-align: center; padding: 50px;">
        <h1 style="color: #22c55e;">✅ Termin bestätigt!</h1>
        <p>Ihr Termin am <strong>${meetingDate.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</strong> um <strong>${meetingDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr</strong> ist bestätigt.</p>
        <p>Sie erhalten eine E-Mail mit dem Meeting-Link.</p>
        <p style="margin-top: 30px;">
          <a href="${meeting.join_url}" style="background: #1a73e8; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px;">
            🎥 Zum Meeting-Link
          </a>
        </p>
      </body>
      </html>
    `);
  } catch (error) {
    logger.error('Book Slot Fehler', { error: error.message });
    res.status(500).send(`<h1>Fehler</h1><p>${error.message}</p>`);
  }
});

// Action History
router.get('/action/history', (req, res) => {
  const history = actionEngineService.getActionHistory(req.query.contactId, parseInt(req.query.limit) || 20);
  res.json(history);
});

export default router;
