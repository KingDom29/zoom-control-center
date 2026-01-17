/**
 * Close CRM API Routes
 */

import express from 'express';
import { closeService } from '../services/closeService.js';
import logger from '../utils/logger.js';

const router = express.Router();

// ============================================
// LEADS
// ============================================

router.get('/leads', async (req, res) => {
  try {
    const { limit = 50, skip = 0, query } = req.query;
    const result = await closeService.getLeads({ limit: parseInt(limit), skip: parseInt(skip), query });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/leads/:id', async (req, res) => {
  try {
    const lead = await closeService.getLead(req.params.id);
    res.json(lead);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/leads', async (req, res) => {
  try {
    const lead = await closeService.createLead(req.body);
    res.json(lead);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/leads/:id', async (req, res) => {
  try {
    const lead = await closeService.updateLead(req.params.id, req.body);
    res.json(lead);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/leads/search/:query', async (req, res) => {
  try {
    const result = await closeService.searchLeads(req.params.query, parseInt(req.query.limit) || 50);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// CONTACTS
// ============================================

router.get('/contacts', async (req, res) => {
  try {
    const result = await closeService.getContacts({ limit: parseInt(req.query.limit) || 100 });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/contacts', async (req, res) => {
  try {
    const { lead_id, ...data } = req.body;
    const contact = await closeService.createContact(lead_id, data);
    res.json(contact);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// OPPORTUNITIES
// ============================================

router.get('/opportunities', async (req, res) => {
  try {
    const result = await closeService.getOpportunities({ 
      limit: parseInt(req.query.limit) || 100,
      leadId: req.query.lead_id 
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/opportunities', async (req, res) => {
  try {
    const opp = await closeService.createOpportunity(req.body);
    res.json(opp);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ACTIVITIES
// ============================================

router.get('/activities/:leadId', async (req, res) => {
  try {
    const activities = await closeService.getActivities(req.params.leadId);
    res.json(activities);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/activities/call', async (req, res) => {
  try {
    const { lead_id, ...data } = req.body;
    const call = await closeService.logCall(lead_id, data);
    res.json(call);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/activities/email', async (req, res) => {
  try {
    const { lead_id, ...data } = req.body;
    const email = await closeService.logEmail(lead_id, data);
    res.json(email);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/activities/note', async (req, res) => {
  try {
    const { lead_id, note } = req.body;
    const result = await closeService.logNote(lead_id, note);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// TASKS
// ============================================

router.post('/tasks', async (req, res) => {
  try {
    const { lead_id, ...data } = req.body;
    const task = await closeService.createTask(lead_id, data);
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// RECOMMENDATIONS (Anruf-Empfehlungen)
// ============================================

router.get('/recommendations', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const recommendations = await closeService.getCallRecommendations(limit);
    res.json({
      date: new Date().toISOString(),
      count: recommendations.length,
      recommendations
    });
  } catch (error) {
    logger.error('Close Recommendations Fehler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// STATUSES & PIPELINES
// ============================================

router.get('/statuses/lead', async (req, res) => {
  try {
    const statuses = await closeService.getLeadStatuses();
    res.json(statuses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/statuses/opportunity', async (req, res) => {
  try {
    const statuses = await closeService.getOpportunityStatuses();
    res.json(statuses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/pipelines', async (req, res) => {
  try {
    const pipelines = await closeService.getPipelines();
    res.json(pipelines);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// TWILIO INTEGRATION
// ============================================

router.post('/log-twilio-call', async (req, res) => {
  try {
    const { phone, ...callData } = req.body;
    const result = await closeService.logTwilioCall(phone, callData);
    res.json({ success: !!result, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/log-twilio-sms', async (req, res) => {
  try {
    const { phone, ...smsData } = req.body;
    const result = await closeService.logTwilioSMS(phone, smsData);
    res.json({ success: !!result, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
