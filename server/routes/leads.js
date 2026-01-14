/**
 * Lead Management API Routes
 * CRUD Operations für Makler-Leads
 */

import express from 'express';
import { leadDatabase, LeadStatus, LeadPriority } from '../services/leadDatabase.js';

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
