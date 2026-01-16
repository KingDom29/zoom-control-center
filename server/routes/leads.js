/**
 * Lead Management API Routes
 * CRUD Operations für Makler-Leads
 */

import express from 'express';
import { leadDatabase, LeadStatus, LeadPriority } from '../services/leadDatabase.js';
import { leadOutreachService, leadTokens, getLeadTrackingUrl } from '../services/leadOutreachService.js';
import { emailService } from '../services/emailService.js';
import { zendeskService } from '../services/zendeskService.js';
import logger from '../utils/logger.js';

const router = express.Router();

// GET /api/leads - Alle Leads abrufen
router.get('/', (req, res) => {
  try {
    const { status, priority, tag, search, sortBy, sortOrder } = req.query;
    const leads = leadDatabase.getAllLeads({ status, priority, tag, search, sortBy, sortOrder });
    res.json({
      success: true,
      count: leads.length,
      leads
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/leads/stats - Statistiken
router.get('/stats', (req, res) => {
  try {
    const stats = leadDatabase.getStats();
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/leads/enums - Status & Priority Optionen
router.get('/enums', (req, res) => {
  res.json({
    success: true,
    statuses: Object.entries(LeadStatus).map(([key, value]) => ({ key, value, label: getStatusLabel(value) })),
    priorities: Object.entries(LeadPriority).map(([key, value]) => ({ key, value, label: getPriorityLabel(value) }))
  });
});

// GET /api/leads/:id - Einzelnen Lead abrufen
router.get('/:id', (req, res) => {
  try {
    const lead = leadDatabase.getLeadById(req.params.id);
    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead nicht gefunden' });
    }
    res.json({ success: true, lead });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/leads - Neuen Lead erstellen
router.post('/', (req, res) => {
  try {
    const lead = leadDatabase.createLead(req.body);
    res.status(201).json({ success: true, lead });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/leads/:id - Lead aktualisieren
router.put('/:id', (req, res) => {
  try {
    const lead = leadDatabase.updateLead(req.params.id, req.body);
    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead nicht gefunden' });
    }
    res.json({ success: true, lead });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/leads/:id/status - Status ändern
router.patch('/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    if (!Object.values(LeadStatus).includes(status)) {
      return res.status(400).json({ success: false, error: 'Ungültiger Status' });
    }
    const lead = leadDatabase.updateStatus(req.params.id, status);
    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead nicht gefunden' });
    }
    res.json({ success: true, lead });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/leads/:id/priority - Priorität ändern
router.patch('/:id/priority', (req, res) => {
  try {
    const { priority } = req.body;
    if (!Object.values(LeadPriority).includes(priority)) {
      return res.status(400).json({ success: false, error: 'Ungültige Priorität' });
    }
    const lead = leadDatabase.updateLead(req.params.id, { priority });
    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead nicht gefunden' });
    }
    res.json({ success: true, lead });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/leads/:id/notes - Notiz hinzufügen
router.post('/:id/notes', (req, res) => {
  try {
    const { note } = req.body;
    if (!note) {
      return res.status(400).json({ success: false, error: 'Notiz erforderlich' });
    }
    const lead = leadDatabase.addNote(req.params.id, note);
    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead nicht gefunden' });
    }
    res.json({ success: true, lead });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/leads/:id/meetings - Meeting hinzufügen
router.post('/:id/meetings', (req, res) => {
  try {
    const lead = leadDatabase.addMeeting(req.params.id, req.body);
    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead nicht gefunden' });
    }
    res.json({ success: true, lead });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/leads/:id - Lead löschen
router.delete('/:id', (req, res) => {
  try {
    const deleted = leadDatabase.deleteLead(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Lead nicht gefunden' });
    }
    res.json({ success: true, message: 'Lead gelöscht' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/leads/bulk-import - Bulk Import von Google Places
router.post('/bulk-import', (req, res) => {
  try {
    const { places } = req.body;
    if (!places || !Array.isArray(places)) {
      return res.status(400).json({ success: false, error: 'places Array erforderlich' });
    }
    const result = leadDatabase.bulkImportFromPlaces(places);
    res.json({
      success: true,
      imported: result.imported.length,
      skipped: result.skipped.length,
      details: result
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================
// OUTREACH ENDPOINTS
// =============================================

// POST /api/leads/generate - Lead-Generierung starten (1 Landkreis + 5 E-Mails)
router.post('/generate', async (req, res) => {
  try {
    const result = await leadOutreachService.runLeadGeneration();
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/leads/queue-status - Queue Status
router.get('/queue-status', (req, res) => {
  try {
    const status = leadOutreachService.getQueueStatus();
    res.json({ success: true, ...status });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/leads/process-next-district - Nächsten Landkreis verarbeiten
router.post('/process-next-district', async (req, res) => {
  try {
    const result = await leadOutreachService.processNextDistrict();
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/leads/process-queue - Queue verarbeiten (5 E-Mails)
router.post('/process-queue', async (req, res) => {
  try {
    const result = await leadOutreachService.processQueue();
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/leads/reset-queue - Queue zurücksetzen
router.post('/reset-queue', (req, res) => {
  try {
    const queue = leadOutreachService.resetQueue();
    res.json({ success: true, message: 'Queue zurückgesetzt', queue });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/leads/process-outreach - Ausstehende E-Mails senden
router.post('/process-outreach', async (req, res) => {
  try {
    const processed = await leadOutreachService.processSequences();
    res.json({ success: true, processed });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/leads/outreach-stats - Outreach Statistiken
router.get('/outreach-stats', (req, res) => {
  try {
    const stats = leadOutreachService.getStats();
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/leads/:id/start-outreach - Outreach für einzelnen Lead starten
router.post('/:id/start-outreach', async (req, res) => {
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

// =============================================
// CLICK TRACKING
// =============================================

// GET /api/leads/track/:action/:token - Click-Tracking
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
    // Fallback: E-Mail senden wenn Zendesk fehlschlägt
    try {
      const actionLabels = {
        'call': '🔥 HOT LEAD - TERMIN GEWÜNSCHT',
        'info': '📄 Lead möchte mehr Infos',
        'optout': '❌ Lead hat sich abgemeldet'
      };
      const isHot = action === 'call';
      await emailService.sendEmail({
        to: 'support@maklerplan.com',
        subject: `${isHot ? '🚨 URGENT: ' : ''}${actionLabels[action] || action} - ${lead.company || lead.name}`,
        body: `<p>Lead-Aktion: ${action}</p><p>E-Mail: ${lead.email}</p><p>Firma: ${lead.company || lead.name}</p>`
      });
    } catch (emailErr) {
      logger.error('Fallback E-Mail auch fehlgeschlagen', { error: emailErr.message });
    }
  }

  // Bestätigungsseite
  const messages = {
    'call': {
      title: '🎉 Termin-Anfrage erhalten!',
      body: 'Vielen Dank für Ihr Interesse! Wir melden uns innerhalb von 2 Stunden bei Ihnen.',
      color: '#22c55e'
    },
    'info': {
      title: '📄 Infos werden gesendet',
      body: 'Sie erhalten in Kürze weitere Informationen per E-Mail.',
      color: '#3b82f6'
    },
    'optout': {
      title: '✅ Abmeldung bestätigt',
      body: 'Sie werden keine weiteren E-Mails von uns erhalten.',
      color: '#6b7280'
    }
  };

  const msg = messages[action] || { title: 'Bestätigt', body: 'Ihre Anfrage wurde registriert.', color: '#333' };

  res.send(`
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Maklerplan</title>
      <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
        .card { background: white; max-width: 400px; margin: 0 auto; padding: 40px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h2 { color: ${msg.color}; margin-bottom: 20px; }
        p { color: #666; }
        .contact { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 14px; color: #999; }
      </style>
    </head>
    <body>
      <div class="card">
        <h2>${msg.title}</h2>
        <p>${msg.body}</p>
        <p class="contact">
          Maklerplan · +49 30 219 25007<br>
          <a href="mailto:support@maklerplan.com">support@maklerplan.com</a>
        </p>
      </div>
    </body>
    </html>
  `);
});

// Helper Functions
function getStatusLabel(status) {
  const labels = {
    new: 'Neu',
    contacted: 'Kontaktiert',
    meeting_scheduled: 'Meeting geplant',
    meeting_done: 'Meeting durchgeführt',
    negotiating: 'In Verhandlung',
    won: 'Gewonnen',
    lost: 'Verloren'
  };
  return labels[status] || status;
}

function getPriorityLabel(priority) {
  const labels = {
    low: 'Niedrig',
    medium: 'Mittel',
    high: 'Hoch',
    hot: '🔥 Hot'
  };
  return labels[priority] || priority;
}

export default router;
