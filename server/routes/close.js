/**
 * Close CRM API Routes
 */

import express from 'express';
import { closeService } from '../services/closeService.js';
import { myzelBridgeService } from '../services/myzelBridgeService.js';
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

// ============================================
// WEBHOOKS - Echtzeit Events
// ============================================

router.get('/webhooks', async (req, res) => {
  try {
    const webhooks = await closeService.getWebhooks();
    res.json(webhooks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/webhooks', async (req, res) => {
  try {
    const result = await closeService.createWebhook(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/webhooks/:id', async (req, res) => {
  try {
    await closeService.deleteWebhook(req.params.id);
    res.json({ success: true, deleted: req.params.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/webhooks/setup-all', async (req, res) => {
  try {
    const callbackUrl = req.body.callback_url || 'https://zoom-control-center-production.up.railway.app/api';
    const results = await closeService.setupAllWebhooks(callbackUrl);
    res.json({ 
      success: true, 
      created: results.filter(r => r.success).length,
      results 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Webhook Receivers - Close sendet Events hierher
router.post('/webhook/lead', async (req, res) => {
  try {
    const event = req.body.event;
    logger.info('📥 Close Webhook: Lead Event', { action: event?.action, lead_id: event?.object_id });
    
    // Bei Lead-Updates: Renew informieren
    if (event?.action === 'updated' && event?.data) {
      const leadData = event.data;
      // Status-Änderungen an Renew melden
      if (event.changed_fields?.includes('status_id')) {
        await myzelBridgeService.sendExternalSignal({
          type: 'lead_status_changed',
          lead_id: leadData.id,
          new_status: leadData.status_label,
          previous_status: event.previous_data?.status_label
        }).catch(e => logger.warn('Renew sync failed', e.message));
      }
    }
    
    res.json({ received: true });
  } catch (error) {
    logger.error('Webhook Lead Error', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/webhook/opportunity', async (req, res) => {
  try {
    const event = req.body.event;
    logger.info('📥 Close Webhook: Opportunity Event', { action: event?.action, opp_id: event?.object_id });
    
    // Bei Won-Status: Provision tracking
    if (event?.data?.status_type === 'won') {
      await myzelBridgeService.sendExternalSignal({
        type: 'opportunity_won',
        opportunity_id: event.data.id,
        lead_id: event.data.lead_id,
        value: event.data.value,
        contact_name: event.data.contact_name
      }).catch(e => logger.warn('Renew sync failed', e.message));
    }
    
    res.json({ received: true });
  } catch (error) {
    logger.error('Webhook Opportunity Error', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/webhook/activity', async (req, res) => {
  try {
    const event = req.body.event;
    logger.info('📥 Close Webhook: Activity Event', { type: event?.object_type, action: event?.action });
    
    // Aktivitäten an Renew für Scoring
    await myzelBridgeService.sendCommunicationEvent({
      type: event?.object_type?.replace('activity.', ''),
      lead_id: event?.lead_id,
      direction: event?.data?.direction,
      timestamp: event?.date_created
    }).catch(e => logger.warn('Renew sync failed', e.message));
    
    res.json({ received: true });
  } catch (error) {
    logger.error('Webhook Activity Error', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/webhook/task', async (req, res) => {
  try {
    const event = req.body.event;
    logger.info('📥 Close Webhook: Task Event', { action: event?.action, task_id: event?.object_id });
    res.json({ received: true });
  } catch (error) {
    logger.error('Webhook Task Error', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// BULK ACTIONS - Massenoperationen
// ============================================

router.post('/bulk/email', async (req, res) => {
  try {
    const { query, template_id, sender_account_id, sender_name, sender_email } = req.body;
    const result = await closeService.bulkEmail(query, template_id, sender_account_id, sender_name, sender_email);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/bulk/sequence-subscribe', async (req, res) => {
  try {
    const { query, sequence_id, sender_account_id, sender_name, sender_email } = req.body;
    const result = await closeService.bulkSequenceSubscribe(query, sequence_id, sender_account_id, sender_name, sender_email);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/bulk/set-status', async (req, res) => {
  try {
    const { query, status_id } = req.body;
    const result = await closeService.bulkSetLeadStatus(query, status_id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/bulk/set-field', async (req, res) => {
  try {
    const { query, field_id, value } = req.body;
    const result = await closeService.bulkSetCustomField(query, field_id, value);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/bulk/:type/:id', async (req, res) => {
  try {
    const result = await closeService.getBulkActionStatus(req.params.type, req.params.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// POWER DIALER - Auto-Calling
// ============================================

router.get('/dialer', async (req, res) => {
  try {
    const sessions = await closeService.getDialerSessions();
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/dialer/start', async (req, res) => {
  try {
    const { smart_view_id, type } = req.body;
    const result = await closeService.startDialer(smart_view_id, type || 'power');
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/dialer/:id', async (req, res) => {
  try {
    await closeService.stopDialer(req.params.id);
    res.json({ success: true, stopped: req.params.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// EVENT LOG
// ============================================

router.get('/events', async (req, res) => {
  try {
    const { limit, object_type } = req.query;
    const events = await closeService.getEventLog(limit || 100, object_type);
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
