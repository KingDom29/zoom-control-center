/**
 * Unified CRM API Routes
 */

import express from 'express';
import {
  unifiedContactService,
  communicationService,
  pipelineService,
  brandingService,
  STAGES,
  SOURCES,
  SEQUENCE_TEMPLATES
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

export default router;
