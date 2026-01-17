/**
 * Close CRM Service
 * Integration mit Close.com für Lead/Contact Management
 */

import axios from 'axios';
import logger from '../utils/logger.js';

const CLOSE_API_KEY = process.env.CLOSE_API_KEY;

class CloseService {
  constructor() {
    this.baseUrl = 'https://api.close.com/api/v1';
    this.auth = CLOSE_API_KEY ? Buffer.from(`${CLOSE_API_KEY}:`).toString('base64') : null;
  }

  isConfigured() {
    return !!this.auth;
  }

  async request(method, endpoint, data = null) {
    if (!this.isConfigured()) {
      logger.warn('Close nicht konfiguriert');
      return null;
    }

    try {
      const response = await axios({
        method,
        url: `${this.baseUrl}${endpoint}`,
        headers: { 'Authorization': `Basic ${this.auth}` },
        data
      });
      return response.data;
    } catch (error) {
      logger.error('Close API Fehler', { 
        endpoint, 
        error: error.response?.data || error.message 
      });
      throw error;
    }
  }

  // ============================================
  // LEADS
  // ============================================

  async getLeads(options = {}) {
    const { limit = 100, skip = 0, query } = options;
    let endpoint = `/lead/?_limit=${limit}&_skip=${skip}`;
    
    if (query) {
      endpoint = `/lead/?_limit=${limit}&query=${encodeURIComponent(query)}`;
    }
    
    return this.request('GET', endpoint);
  }

  async getLead(leadId) {
    return this.request('GET', `/lead/${leadId}/`);
  }

  async createLead(data) {
    return this.request('POST', '/lead/', data);
  }

  async updateLead(leadId, data) {
    return this.request('PUT', `/lead/${leadId}/`, data);
  }

  async searchLeads(query, limit = 50) {
    return this.request('GET', `/lead/?_limit=${limit}&query=${encodeURIComponent(query)}`);
  }

  // ============================================
  // CONTACTS
  // ============================================

  async getContacts(options = {}) {
    const { limit = 100, skip = 0 } = options;
    return this.request('GET', `/contact/?_limit=${limit}&_skip=${skip}`);
  }

  async getContact(contactId) {
    return this.request('GET', `/contact/${contactId}/`);
  }

  async createContact(leadId, data) {
    return this.request('POST', '/contact/', { lead_id: leadId, ...data });
  }

  async updateContact(contactId, data) {
    return this.request('PUT', `/contact/${contactId}/`, data);
  }

  // ============================================
  // OPPORTUNITIES (Deals)
  // ============================================

  async getOpportunities(options = {}) {
    const { limit = 100, leadId } = options;
    let endpoint = `/opportunity/?_limit=${limit}`;
    if (leadId) endpoint += `&lead_id=${leadId}`;
    return this.request('GET', endpoint);
  }

  async createOpportunity(data) {
    return this.request('POST', '/opportunity/', data);
  }

  async updateOpportunity(opportunityId, data) {
    return this.request('PUT', `/opportunity/${opportunityId}/`, data);
  }

  // ============================================
  // ACTIVITIES
  // ============================================

  async getActivities(leadId, limit = 50) {
    return this.request('GET', `/activity/?lead_id=${leadId}&_limit=${limit}`);
  }

  async logCall(leadId, data) {
    return this.request('POST', '/activity/call/', {
      lead_id: leadId,
      direction: data.direction || 'outbound',
      status: data.status || 'completed',
      duration: data.duration,
      note: data.note,
      phone: data.phone,
      ...data
    });
  }

  async logEmail(leadId, data) {
    return this.request('POST', '/activity/email/', {
      lead_id: leadId,
      direction: data.direction || 'outgoing',
      subject: data.subject,
      body_text: data.body,
      status: 'sent',
      ...data
    });
  }

  async logNote(leadId, note) {
    return this.request('POST', '/activity/note/', {
      lead_id: leadId,
      note
    });
  }

  async createTask(leadId, data) {
    return this.request('POST', '/task/', {
      lead_id: leadId,
      text: data.text,
      date: data.date || new Date().toISOString().split('T')[0],
      is_complete: false,
      ...data
    });
  }

  // ============================================
  // STATUSES & PIPELINES
  // ============================================

  async getLeadStatuses() {
    return this.request('GET', '/status/lead/');
  }

  async getOpportunityStatuses() {
    return this.request('GET', '/status/opportunity/');
  }

  async getPipelines() {
    return this.request('GET', '/pipeline/');
  }

  // ============================================
  // SMART VIEWS & REPORTING
  // ============================================

  async getSmartViews() {
    return this.request('GET', '/saved_search/');
  }

  async getLeadsByStatus(statusId, limit = 100) {
    return this.searchLeads(`status_id:${statusId}`, limit);
  }

  // ============================================
  // CALL RECOMMENDATIONS (Integration mit unserem System)
  // ============================================

  async getCallRecommendations(limit = 10) {
    const recommendations = [];

    try {
      // 1. Leads mit offenen Tasks heute
      const tasksResult = await this.request('GET', `/task/?is_complete=false&_limit=20`);
      const todayTasks = (tasksResult?.data || []).filter(t => {
        const taskDate = new Date(t.date);
        const today = new Date();
        return taskDate.toDateString() === today.toDateString();
      });

      for (const task of todayTasks.slice(0, 5)) {
        const lead = await this.getLead(task.lead_id);
        if (lead && lead.contacts?.[0]) {
          const contact = lead.contacts[0];
          const phone = contact.phones?.[0]?.phone;
          if (phone) {
            recommendations.push({
              leadId: lead.id,
              contactId: contact.id,
              name: contact.name || lead.name,
              company: lead.name,
              phone,
              email: contact.emails?.[0]?.email,
              priority: 'high',
              reason: `📋 Task: ${task.text}`,
              score: 90,
              source: 'close_task'
            });
          }
        }
      }

      // 2. Leads mit Status "Neu eingegangen" (noch nicht kontaktiert)
      const newLeads = await this.searchLeads('status:"Neu eingegangen"', 20);
      for (const lead of (newLeads?.data || []).slice(0, 5)) {
        if (lead.contacts?.[0]) {
          const contact = lead.contacts[0];
          const phone = contact.phones?.[0]?.phone;
          if (phone && !recommendations.find(r => r.leadId === lead.id)) {
            recommendations.push({
              leadId: lead.id,
              contactId: contact.id,
              name: contact.name || lead.name,
              company: lead.name,
              phone,
              email: contact.emails?.[0]?.email,
              priority: 'medium',
              reason: '🆕 Neuer Lead - Erstkontakt',
              score: 75,
              source: 'close_new_lead'
            });
          }
        }
      }

      // 3. Leads mit Opportunities in Verhandlung
      const opportunities = await this.getOpportunities({ limit: 30 });
      for (const opp of (opportunities?.data || []).filter(o => o.status_type === 'active')) {
        const lead = await this.getLead(opp.lead_id);
        if (lead && lead.contacts?.[0]) {
          const contact = lead.contacts[0];
          const phone = contact.phones?.[0]?.phone;
          if (phone && !recommendations.find(r => r.leadId === lead.id)) {
            recommendations.push({
              leadId: lead.id,
              contactId: contact.id,
              name: contact.name || lead.name,
              company: lead.name,
              phone,
              email: contact.emails?.[0]?.email,
              priority: 'high',
              reason: `💰 Opportunity: ${opp.status_label} (${opp.confidence}%)`,
              score: 85,
              value: opp.value,
              source: 'close_opportunity'
            });
          }
        }
      }

      // Nach Score sortieren
      recommendations.sort((a, b) => b.score - a.score);
      
      return recommendations.slice(0, limit);

    } catch (error) {
      logger.error('Close getCallRecommendations Fehler', { error: error.message });
      return [];
    }
  }

  // ============================================
  // BULK OPERATIONS
  // ============================================

  async bulkUpdateLeads(leadIds, data) {
    const results = [];
    for (const leadId of leadIds) {
      try {
        const result = await this.updateLead(leadId, data);
        results.push({ leadId, success: true, result });
      } catch (error) {
        results.push({ leadId, success: false, error: error.message });
      }
    }
    return results;
  }

  // ============================================
  // SYNC MIT TWILIO
  // ============================================

  async logTwilioCall(phone, callData) {
    // Lead nach Telefonnummer suchen
    const searchResult = await this.searchLeads(`phone:"${phone}"`, 1);
    const lead = searchResult?.data?.[0];
    
    if (lead) {
      return this.logCall(lead.id, {
        direction: callData.direction || 'outbound',
        duration: callData.duration,
        phone,
        note: callData.note || `Twilio Call - ${callData.status}`,
        recording_url: callData.recordingUrl
      });
    }
    
    return null;
  }

  async logTwilioSMS(phone, smsData) {
    const searchResult = await this.searchLeads(`phone:"${phone}"`, 1);
    const lead = searchResult?.data?.[0];
    
    if (lead) {
      return this.request('POST', '/activity/sms/', {
        lead_id: lead.id,
        direction: smsData.direction || 'outgoing',
        text: smsData.text,
        phone,
        status: 'sent'
      });
    }
    
    return null;
  }
}

export const closeService = new CloseService();
export default closeService;
