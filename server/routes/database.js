/**
 * Database API Routes
 */

import express from 'express';
import { databaseService } from '../services/databaseService.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Health Check
router.get('/health', async (req, res) => {
  try {
    if (!databaseService.isConfigured()) {
      return res.json({ status: 'not_configured', message: 'DATABASE_URL nicht gesetzt' });
    }
    await databaseService.initialize();
    const result = await databaseService.query('SELECT NOW() as time');
    res.json({ status: 'connected', time: result.rows[0].time });
  } catch (error) {
    res.status(500).json({ status: 'error', error: error.message });
  }
});

// Setup Schema
router.post('/setup', async (req, res) => {
  try {
    const result = await databaseService.setupSchema();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Stats
router.get('/stats', async (req, res) => {
  try {
    const stats = await databaseService.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Leads
router.get('/leads', async (req, res) => {
  try {
    const { status } = req.query;
    if (status) {
      const leads = await databaseService.getLeadsByStatus(status);
      res.json({ count: leads.length, leads });
    } else {
      const result = await databaseService.query('SELECT * FROM leads ORDER BY updated_at DESC LIMIT 100');
      res.json({ count: result.rows.length, leads: result.rows });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/leads', async (req, res) => {
  try {
    const lead = await databaseService.upsertLead(req.body);
    res.json(lead);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/leads/:id', async (req, res) => {
  try {
    const lead = await databaseService.getLeadById(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead nicht gefunden' });
    res.json(lead);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Makler
router.get('/makler', async (req, res) => {
  try {
    const { top } = req.query;
    if (top) {
      const makler = await databaseService.getTopMakler(parseInt(top));
      res.json({ count: makler.length, makler });
    } else {
      const result = await databaseService.query('SELECT * FROM makler WHERE aktiv = true ORDER BY erfolgsquote DESC LIMIT 100');
      res.json({ count: result.rows.length, makler: result.rows });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/makler', async (req, res) => {
  try {
    const makler = await databaseService.upsertMakler(req.body);
    res.json(makler);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Activities
router.get('/activities/:leadId', async (req, res) => {
  try {
    const { limit } = req.query;
    const activities = await databaseService.getActivitiesByLead(req.params.leadId, limit || 50);
    res.json({ count: activities.length, activities });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/activities', async (req, res) => {
  try {
    const { lead_id, type, direction, content, metadata } = req.body;
    const activity = await databaseService.logActivity(lead_id, type, direction, content, metadata);
    res.json(activity);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Renew Scores
router.get('/renew-scores/:leadId', async (req, res) => {
  try {
    const scores = await databaseService.getRenewScoreHistory(req.params.leadId);
    res.json({ count: scores.length, scores });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/renew-scores', async (req, res) => {
  try {
    const { lead_id, score_type, score_value, details } = req.body;
    const score = await databaseService.saveRenewScore(lead_id, score_type, score_value, details);
    res.json(score);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
