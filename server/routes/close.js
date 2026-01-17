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

router.put('/statuses/lead/:id', async (req, res) => {
  try {
    const result = await closeService.updateLeadStatus(req.params.id, req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/statuses/lead/:id', async (req, res) => {
  try {
    await closeService.deleteLeadStatus(req.params.id);
    res.json({ success: true, deleted: req.params.id });
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

router.put('/pipelines/:id', async (req, res) => {
  try {
    const result = await closeService.updatePipeline(req.params.id, req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/statuses/opportunity/:id', async (req, res) => {
  try {
    const result = await closeService.request('PUT', `/status/opportunity/${req.params.id}/`, req.body);
    res.json(result);
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

// ============================================
// ADMIN / RESET
// ============================================

router.delete('/leads/:id', async (req, res) => {
  try {
    await closeService.deleteLead(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/reset-all', async (req, res) => {
  try {
    const { confirm } = req.body;
    if (confirm !== 'DELETE_ALL_LEADS') {
      return res.status(400).json({ error: 'Bestätigung erforderlich: confirm = "DELETE_ALL_LEADS"' });
    }
    
    res.json({ message: 'Löschung gestartet... Dies kann einige Minuten dauern.' });
    
    // Async ausführen
    closeService.deleteAllLeads().then(result => {
      logger.info('Close Reset abgeschlossen', result);
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// LEAD IMPORT (Eigentümer & Makler)
// ============================================

// Immobilieneigentümer importieren
router.post('/import/eigentuemer', async (req, res) => {
  try {
    const lead = await closeService.importEigentuemer(req.body);
    res.json({ success: true, lead });
  } catch (error) {
    logger.error('Eigentümer Import Fehler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Makler-Partner importieren
router.post('/import/makler', async (req, res) => {
  try {
    const lead = await closeService.importMakler(req.body);
    res.json({ success: true, lead });
  } catch (error) {
    logger.error('Makler Import Fehler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Zendesk Sync
router.post('/import/zendesk', async (req, res) => {
  try {
    const { type = 'makler', ...data } = req.body;
    const lead = await closeService.importFromZendesk(data, type);
    res.json({ success: true, lead });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Leads nach Typ abrufen
router.get('/leads/type/:type', async (req, res) => {
  try {
    const result = await closeService.getLeadsByType(req.params.type, parseInt(req.query.limit) || 100);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Makler mit Kontingent
router.get('/makler/mit-kontingent', async (req, res) => {
  try {
    const { plz } = req.query;
    const makler = await closeService.getMaklerMitKontingent(plz);
    res.json({ makler });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Lead einem Makler zuweisen
router.post('/assign-lead', async (req, res) => {
  try {
    const { leadId, maklerId } = req.body;
    if (!leadId || !maklerId) {
      return res.status(400).json({ error: 'leadId und maklerId erforderlich' });
    }
    const result = await closeService.assignLeadToMakler(leadId, maklerId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// CLOSE.COM FEATURES EXPLORATION
// ============================================

router.get('/explore', async (req, res) => {
  try {
    const [org, users, templates, sequences, phones, smartViews] = await Promise.all([
      closeService.getOrganization().catch(() => null),
      closeService.getUsers().catch(() => null),
      closeService.getEmailTemplates().catch(() => null),
      closeService.getSequences().catch(() => null),
      closeService.getPhoneNumbers().catch(() => null),
      closeService.getSmartViews().catch(() => null)
    ]);

    res.json({
      organization: org ? { name: org.first_name, email: org.email } : null,
      users: users?.data?.length || 0,
      email_templates: templates?.data?.length || 0,
      sequences: sequences?.data?.length || 0,
      phone_numbers: phones?.data?.length || 0,
      smart_views: smartViews?.data?.length || 0,
      features: {
        calling: !!phones?.data?.length,
        email_sync: true,
        sms: true,
        sequences: true,
        smart_views: true,
        custom_fields: true,
        pipelines: true,
        webhooks: true
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/email-templates', async (req, res) => {
  try {
    const templates = await closeService.getEmailTemplates();
    res.json(templates);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/email-templates', async (req, res) => {
  try {
    const template = await closeService.createEmailTemplate(req.body);
    res.json(template);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/sequences', async (req, res) => {
  try {
    const sequences = await closeService.getSequences();
    res.json(sequences);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/sequences/:id', async (req, res) => {
  try {
    const result = await closeService.updateSequence(req.params.id, req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/sequences', async (req, res) => {
  try {
    const result = await closeService.createSequence(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/smart-views', async (req, res) => {
  try {
    const views = await closeService.getSmartViews();
    res.json(views);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/smart-views', async (req, res) => {
  try {
    const result = await closeService.createSmartView(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/phone-numbers', async (req, res) => {
  try {
    const phones = await closeService.getPhoneNumbers();
    res.json(phones);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/users', async (req, res) => {
  try {
    const users = await closeService.getUsers();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/send-email', async (req, res) => {
  try {
    const { lead_id, ...data } = req.body;
    const result = await closeService.sendEmail(lead_id, data);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/send-sms', async (req, res) => {
  try {
    const { lead_id, ...data } = req.body;
    const result = await closeService.sendSMS(lead_id, data);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// CUSTOM FIELD MANAGEMENT
// ============================================

router.get('/custom-fields', async (req, res) => {
  try {
    const fields = await closeService.getCustomFields();
    res.json({ 
      count: fields.length,
      fields: fields.map(f => ({ id: f.id, name: f.name, type: f.type }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/custom-fields/:id', async (req, res) => {
  try {
    await closeService.deleteCustomField(req.params.id);
    res.json({ success: true, deleted: req.params.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/custom-fields', async (req, res) => {
  try {
    const { confirm } = req.body;
    if (confirm !== 'DELETE_ALL_FIELDS') {
      return res.status(400).json({ error: 'Bestätigung erforderlich: confirm = "DELETE_ALL_FIELDS"' });
    }
    const results = await closeService.deleteAllCustomFields();
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/custom-fields/setup-renew', async (req, res) => {
  try {
    const results = await closeService.setupRenewCustomFields();
    res.json({ 
      success: true, 
      created: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
