/**
 * Lead Outreach Routes
 * Email sequences, tracking, generation
 */

import express from 'express';
import { leadDatabase } from '../../services/leadDatabase.js';
import { leadOutreachService } from '../../services/leadOutreachService.js';
import { emailService } from '../../services/emailService.js';
import { zendeskService } from '../../services/zendeskService.js';
import logger from '../../utils/logger.js';

const router = express.Router();

// POST /generate - Lead-Generierung starten (1 Landkreis + 5 E-Mails)
router.post('/generate', async (req, res) => {
  try {
    const result = await leadOutreachService.runLeadGeneration();
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /queue-status - Queue Status
router.get('/queue-status', (req, res) => {
  try {
    const status = leadOutreachService.getQueueStatus();
    res.json({ success: true, ...status });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /process-next-district - Nächsten Landkreis verarbeiten
router.post('/process-next-district', async (req, res) => {
  try {
    const result = await leadOutreachService.processNextDistrict();
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /process-queue - Queue verarbeiten (5 E-Mails)
router.post('/process-queue', async (req, res) => {
  try {
    const result = await leadOutreachService.processQueue();
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /reset-queue - Queue zurücksetzen
router.post('/reset-queue', (req, res) => {
  try {
    const queue = leadOutreachService.resetQueue();
    res.json({ success: true, message: 'Queue zurückgesetzt', queue });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /process - Ausstehende E-Mails senden
router.post('/process', async (req, res) => {
  try {
    const processed = await leadOutreachService.processSequences();
    res.json({ success: true, processed });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /stats - Outreach Statistiken
router.get('/stats', (req, res) => {
  try {
    const stats = leadOutreachService.getStats();
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /:id/start - Outreach für einzelnen Lead starten
router.post('/:id/start', async (req, res) => {
  try {
    const lead = leadDatabase.getLeadById(req.params.id);
    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead nicht gefunden' });
    }
    if (!lead.email) {
      return res.status(400).json({ success: false, error: 'Lead hat keine E-Mail' });
    }
    const sequence = await leadOutreachService.startSequence(lead);
    res.json({ success: true, sequence });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /track/:action/:token - Click-Tracking
router.get('/track/:action/:token', async (req, res) => {
  const { action, token } = req.params;
  
  const result = leadOutreachService.handleClick(token);
  
  if (!result) {
    return res.status(410).send(`
      <html>
      <head><meta charset="utf-8"><title>Link abgelaufen</title></head>
      <body style="font-family: Arial; text-align: center; padding: 50px;">
        <h2>⏰ Dieser Link ist leider abgelaufen</h2>
        <p>Bitte kontaktieren Sie uns direkt unter support@maklerplan.com</p>
      </body>
      </html>
    `);
  }

  const { lead } = result;

  // Zendesk Ticket erstellen
  try {
    const ticket = await zendeskService.createHotLeadTicket(lead, action);
    if (ticket) {
      logger.info(`🎫 Zendesk Ticket #${ticket.id} erstellt für ${lead.email}`);
    }
  } catch (e) {
    logger.error('Zendesk Ticket Fehler', { error: e.message });
    // Fallback E-Mail
    try {
      const actionLabels = { 'call': '🔥 HOT LEAD - TERMIN GEWÜNSCHT', 'info': '📄 Lead möchte mehr Infos', 'optout': '❌ Lead hat sich abgemeldet' };
      await emailService.sendEmail({
        to: 'support@maklerplan.com',
        subject: `${action === 'call' ? '🚨 URGENT: ' : ''}${actionLabels[action] || action} - ${lead.company || lead.name}`,
        body: `<p>Lead-Aktion: ${action}</p><p>E-Mail: ${lead.email}</p><p>Firma: ${lead.company || lead.name}</p>`
      });
    } catch (emailErr) {
      logger.error('Fallback E-Mail fehlgeschlagen', { error: emailErr.message });
    }
  }

  // Bestätigungsseite
  const messages = {
    'call': { title: '🎉 Termin-Anfrage erhalten!', body: 'Vielen Dank für Ihr Interesse! Wir melden uns innerhalb von 2 Stunden bei Ihnen.', color: '#22c55e' },
    'info': { title: '📄 Infos werden gesendet', body: 'Sie erhalten in Kürze weitere Informationen per E-Mail.', color: '#3b82f6' },
    'optout': { title: '✅ Abmeldung bestätigt', body: 'Sie werden keine weiteren E-Mails von uns erhalten.', color: '#6b7280' }
  };

  const msg = messages[action] || { title: 'Bestätigt', body: 'Ihre Anfrage wurde registriert.', color: '#333' };

  res.send(`
    <html>
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Maklerplan</title></head>
    <body style="font-family: Arial; text-align: center; padding: 50px; background: #f5f5f5;">
      <div style="background: white; max-width: 400px; margin: 0 auto; padding: 40px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <h2 style="color: ${msg.color}; margin-bottom: 20px;">${msg.title}</h2>
        <p style="color: #666;">${msg.body}</p>
        <p style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 14px; color: #999;">
          Maklerplan · +49 30 219 25007<br><a href="mailto:support@maklerplan.com">support@maklerplan.com</a>
        </p>
      </div>
    </body>
    </html>
  `);
});

export default router;
