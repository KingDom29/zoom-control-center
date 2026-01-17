/**
 * Close CRM Service
 * Integration mit Close.com für Lead/Contact Management
 */

import axios from 'axios';
import logger from '../utils/logger.js';
import { myzelBridgeService } from './myzelBridgeService.js';

const CLOSE_API_KEY = process.env.CLOSE_API_KEY;

// Close Custom Field IDs (aus deinem Close Account)
const CUSTOM_FIELDS = {
  // Makler Identifikation
  MAKLER_ID: 'cf_Y2d1QZkiAdxUc6lLXFQ9jvyIs9BMTTYY4x6FNbmedA0',
  BEXIO_ID: 'cf_AVokd0aJG9U6fi2gG5R7LgPo0lrVqnNPJ8zWzWHJTky',
  PARTNER_ABO: 'cf_bax6RWceG5MyONSmL8MVomYKkGFY7WTsuFrDcgEs89q',
  KONTINGENT: 'cf_gmYQtuaxs9PnnaabG3BawLNBaiT0HLEiG3ZW952U83U',
  UMKREIS: 'cf_o2DnvZkQyAIagRUTUxS5WUxmZofuVS6E5fsKNBJ4DZ1',
  VERMITTELTE_LEADS: 'cf_K8poQgxjji1IekYd3ZcIPsyjTIpMVlRnvXGAQuT64Vi',
  
  // Renew Intelligence (NEU)
  RENEW_BETRUGS_SCORE: 'cf_MpjSuek6IbnrGjlMltypxDE4kT98F6zBieD59ejd6Mf',
  RENEW_BEREITSCHAFT: 'cf_5JiGXhI8bO8HxXekbCERkoQRvbwUZphMwcU6lrvX8DC',
  RENEW_VERTRAUENSSTUFE: 'cf_Yy2wFvkYWn3vDUoPvSrwzft6mtRvNgO97aEOOZOYNsE',
  RENEW_LETZTE_PRUEFUNG: 'cf_SIu2WlfIyAjvyjhxHfBRsUTYw9pXRenFz8xlnIznNcv',
  RENEW_ZAHLUNGSSTATUS: 'cf_gIvH5clzYYdqEJWa3ipbRnsphZYJLg4x9Qmh6c4xvCt',
  
  // Performance Tracking (NEU)
  LEADS_VERKAUFT: 'cf_uMpL9Q0WcXSvvWYCZdzRSALrsXfQQBQjE5JgtwBpop8',
  LEADS_VERLOREN: 'cf_wv4HVS6Bjv2izlGXEdYTnTuEbKgi6EcPBJEChZ81IJk',
  ERFOLGSQUOTE: 'cf_s6KziX2G6jVThS0ILD5QoI31PhF7av8n8BXAliso4rj',
  
  // Eigentümer/Immobilien Fields
  PLZ_IMMOBILIE: 'cf_3AfXiLIZpt0X0VbPwcVlhGATwLfRoXV4f9ZIgEDN2y0',
  ZUGEWIESENER_MAKLER: 'cf_U5YAt35H9XzlzQKO7M0r0ZIZ0CSaFeocjjzxKw1Gguo',
  ZUWEISUNG_DATUM: 'cf_byrT8cziGBDyV2EJC2e1PrBGSLqk0eOXW3pHise2ktL'
};

class CloseService {
  constructor() {
    this.baseUrl = 'https://api.close.com/api/v1';
    this.auth = CLOSE_API_KEY ? Buffer.from(`${CLOSE_API_KEY}:`).toString('base64') : null;
    this.fields = CUSTOM_FIELDS;
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

  async updateLeadStatus(statusId, data) {
    return this.request('PUT', `/status/lead/${statusId}/`, data);
  }

  async deleteLeadStatus(statusId) {
    return this.request('DELETE', `/status/lead/${statusId}/`);
  }

  async getOpportunityStatuses() {
    return this.request('GET', '/status/opportunity/');
  }

  async getPipelines() {
    return this.request('GET', '/pipeline/');
  }

  async updatePipeline(pipelineId, data) {
    return this.request('PUT', `/pipeline/${pipelineId}/`, data);
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
  // CLOSE.COM FEATURES EXPLORATION
  // ============================================

  async getEmailTemplates() {
    return this.request('GET', '/email_template/');
  }

  async createEmailTemplate(data) {
    return this.request('POST', '/email_template/', data);
  }

  async getSequences() {
    return this.request('GET', '/sequence/');
  }

  async getConnectedAccounts() {
    return this.request('GET', '/connected_account/');
  }

  async getPhoneNumbers() {
    return this.request('GET', '/phone_number/');
  }

  async getUsers() {
    return this.request('GET', '/user/');
  }

  async getOrganization() {
    return this.request('GET', '/me/');
  }

  async sendEmail(leadId, data) {
    return this.request('POST', '/activity/email/', {
      lead_id: leadId,
      direction: 'outgoing',
      status: 'outbox',
      subject: data.subject,
      body_text: data.body_text,
      body_html: data.body_html,
      to: data.to,
      ...data
    });
  }

  async sendSMS(leadId, data) {
    return this.request('POST', '/activity/sms/', {
      lead_id: leadId,
      direction: 'outgoing',
      status: 'scheduled',
      text: data.text,
      phone: data.phone,
      ...data
    });
  }

  async getCallStats() {
    return this.request('GET', '/report/activity/call/');
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

  async deleteLead(leadId) {
    return this.request('DELETE', `/lead/${leadId}/`);
  }

  async deleteAllLeads() {
    let deleted = 0;
    let errors = 0;
    let hasMore = true;

    while (hasMore) {
      const leads = await this.getLeads({ limit: 100 });
      
      if (!leads?.data || leads.data.length === 0) {
        hasMore = false;
        break;
      }

      for (const lead of leads.data) {
        try {
          await this.deleteLead(lead.id);
          deleted++;
          if (deleted % 50 === 0) {
            logger.info(`Close: ${deleted} Leads gelöscht...`);
          }
        } catch (error) {
          errors++;
          logger.error('Delete Lead Fehler', { leadId: lead.id, error: error.message });
        }
      }

      // Rate Limiting - kurze Pause
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    logger.info(`Close komplett geleert: ${deleted} gelöscht, ${errors} Fehler`);
    return { deleted, errors };
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

  // ============================================
  // ZENDESK → CLOSE SYNC
  // ============================================

  /**
   * Importiert einen Zendesk User/Ticket als Close Lead
   */
  async importFromZendesk(zendeskData, type = 'makler') {
    const { 
      email, 
      name, 
      phone, 
      company,
      address,
      tags = [],
      ticketId,
      ticketSubject,
      customFields = {}
    } = zendeskData;

    // Prüfen ob Lead schon existiert
    const existing = await this.searchLeads(`email:"${email}"`, 1);
    if (existing?.data?.length > 0) {
      // Lead updaten
      return this.updateLead(existing.data[0].id, {
        custom: customFields
      });
    }

    // Neuen Lead erstellen
    const leadData = {
      name: company || name,
      url: zendeskData.website || null,
      description: ticketSubject ? `Zendesk Ticket: ${ticketSubject}` : '',
      status_id: 'stat_MNwde2bb9U6q8UIBiwqKN6luKLezxVoTRvQBrFcCcM3', // "Neu eingegangen"
      contacts: [{
        name: name,
        emails: email ? [{ email, type: 'office' }] : [],
        phones: phone ? [{ phone, type: 'office' }] : []
      }],
      custom: {
        'Quelle': 'Zendesk',
        'Typ': type, // 'makler' oder 'eigentuemer'
        'Zendesk Ticket ID': ticketId || null,
        ...customFields
      }
    };

    if (address) {
      leadData.addresses = [{ address_1: address, city: '', country: 'DE' }];
    }

    return this.createLead(leadData);
  }

  /**
   * Importiert Immobilieneigentümer als Lead
   */
  async importEigentuemer(data) {
    const {
      name,
      email,
      phone,
      immobilienTyp,
      plz,
      ort,
      strasse,
      verkaufsgrund,
      zeitrahmen,
      preis,
      maklerId
    } = data;

    const leadData = {
      name: name || `Eigentümer ${plz || ''}`,
      description: `${immobilienTyp || 'Immobilie'} in ${plz || ''} ${ort || ''}`,
      status_id: 'stat_MNwde2bb9U6q8UIBiwqKN6luKLezxVoTRvQBrFcCcM3',
      contacts: [{
        name: name || 'Eigentümer',
        emails: email ? [{ email, type: 'office' }] : [],
        phones: phone ? [{ phone, type: 'mobile' }] : []
      }],
      [`custom.${this.fields.PLZ_IMMOBILIE}`]: plz || '',
      [`custom.${this.fields.ZUGEWIESENER_MAKLER}`]: maklerId || ''
    };

    return this.createLead(leadData);
  }

  /**
   * Importiert Makler-Partner als Lead
   */
  async importMakler(data) {
    const {
      firma,
      ansprechpartner,
      email,
      phone,
      website,
      plz,
      ort,
      umkreis,
      abonnement,
      kontingent,
      bexioId
    } = data;

    const leadData = {
      name: firma,
      url: website || null,
      description: `Makler-Partner in ${plz || ''} ${ort || ''}`,
      status_id: 'stat_MNwde2bb9U6q8UIBiwqKN6luKLezxVoTRvQBrFcCcM3',
      contacts: [{
        name: ansprechpartner || firma,
        emails: email ? [{ email, type: 'office' }] : [],
        phones: phone ? [{ phone, type: 'office' }] : []
      }],
      [`custom.${this.fields.MAKLER_ID}`]: bexioId || '',
      [`custom.${this.fields.BEXIO_ID}`]: bexioId || '',
      [`custom.${this.fields.PARTNER_ABO}`]: abonnement || 'PREPAID',
      [`custom.${this.fields.KONTINGENT}`]: kontingent || 0,
      [`custom.${this.fields.UMKREIS}`]: umkreis || 25,
      [`custom.${this.fields.PLZ_IMMOBILIE}`]: plz || ''
    };

    return this.createLead(leadData);
  }

  /**
   * Holt alle Leads eines bestimmten Typs
   */
  async getLeadsByType(type, limit = 100) {
    // Close Custom Field Query
    return this.searchLeads(`custom.Typ:"${type}"`, limit);
  }

  /**
   * Holt Makler mit freiem Kontingent
   */
  async getMaklerMitKontingent(plz, limit = 10) {
    // Makler in der Nähe mit Kontingent > 0
    const makler = await this.searchLeads(`custom.Typ:"makler"`, 100);
    
    if (!makler?.data) return [];

    return makler.data.filter(m => {
      const kontingent = m.custom?.['Kontingent Leads'] || 0;
      const umkreis = m.custom?.['Partner-Umkreis km'] || 25;
      // TODO: PLZ-Distanz berechnen
      return kontingent > 0;
    }).slice(0, limit);
  }

  /**
   * Lead einem Makler zuweisen - MIT FRAUD-CHECK!
   */
  async assignLeadToMakler(leadId, maklerId, options = {}) {
    const { skipFraudCheck = false } = options;

    // Makler-Daten holen um Bexio-Nr zu bekommen
    const makler = await this.getLead(maklerId);
    if (!makler) {
      return { success: false, error: 'Makler nicht gefunden' };
    }

    const bexioNr = makler.custom?.[`custom.${this.fields.BEXIO_ID}`] || 
                    makler[`custom.${this.fields.BEXIO_ID}`] ||
                    maklerId;

    // FRAUD-CHECK via Myzel Bridge
    if (!skipFraudCheck) {
      try {
        const check = await myzelBridgeService.checkBeforeAssignment(bexioNr);
        
        if (!check.canAssign) {
          logger.warn('Lead-Zuweisung BLOCKED durch Myzel', { 
            leadId, 
            maklerId, 
            bexioNr,
            reason: check.recommendation 
          });
          
          return { 
            success: false, 
            blocked: true,
            reason: check.recommendation,
            fraudCheck: check.fraud,
            billingCheck: check.billing
          };
        }
        
        logger.info('Myzel Fraud-Check bestanden', { bexioNr, check });
      } catch (error) {
        logger.warn('Myzel nicht erreichbar - fahre ohne Check fort', { error: error.message });
      }
    }

    // Lead updaten
    await this.updateLead(leadId, {
      [`custom.${this.fields.ZUGEWIESENER_MAKLER}`]: maklerId,
      [`custom.${this.fields.ZUWEISUNG_DATUM}`]: new Date().toISOString().split('T')[0]
    });

    // Makler Kontingent reduzieren
    const currentKontingent = makler[`custom.${this.fields.KONTINGENT}`] || 1;
    await this.updateLead(maklerId, {
      [`custom.${this.fields.KONTINGENT}`]: Math.max(0, currentKontingent - 1)
    });

    // Task erstellen beim Makler
    await this.createTask(maklerId, {
      text: `🏠 Neuer Lead zugewiesen! Lead-ID: ${leadId}`,
      date: new Date().toISOString().split('T')[0]
    });

    logger.info('Lead erfolgreich zugewiesen', { leadId, maklerId, bexioNr });
    
    return { 
      success: true, 
      leadId, 
      maklerId,
      bexioNr,
      message: 'Lead erfolgreich zugewiesen (Fraud-Check bestanden)'
    };
  }

  // ============================================
  // CUSTOM FIELD MANAGEMENT
  // ============================================

  async getCustomFields() {
    const result = await this.request('GET', '/custom_field/lead/');
    return result?.data || [];
  }

  async createCustomField(fieldData) {
    return this.request('POST', '/custom_field/lead/', fieldData);
  }

  async deleteCustomField(fieldId) {
    return this.request('DELETE', `/custom_field/lead/${fieldId}/`);
  }

  async deleteAllCustomFields() {
    const fields = await this.getCustomFields();
    const results = [];
    
    for (const field of fields) {
      try {
        await this.deleteCustomField(field.id);
        results.push({ id: field.id, name: field.name, deleted: true });
        logger.info(`Custom Field gelöscht: ${field.name}`);
      } catch (error) {
        results.push({ id: field.id, name: field.name, deleted: false, error: error.message });
      }
    }
    
    return results;
  }

  async setupRenewCustomFields() {
    const renewFields = [
      // Renew Intelligence (NEU)
      { name: 'Renew Betrugs-Score', type: 'number', description: '0-100, hoeher = mehr Risiko' },
      { name: 'Renew Bereitschaft', type: 'number', description: '0-1 Readiness Score' },
      { name: 'Renew Vertrauensstufe', type: 'choices', choices: ['verifiziert', 'standard', 'verdaechtig', 'gesperrt'] },
      { name: 'Renew Letzte Pruefung', type: 'date' },
      { name: 'Renew Zahlungsstatus', type: 'choices', choices: ['bezahlt', 'ausstehend', 'ueberfaellig', 'gesperrt'] },
      
      // Performance Tracking (NEU)
      { name: 'Leads Verkauft', type: 'number', description: 'Anzahl verkaufter Childs' },
      { name: 'Leads Verloren', type: 'number', description: 'Anzahl verlorener Childs' },
      { name: 'Erfolgsquote Prozent', type: 'number', description: 'Conversion Rate in %' }
    ];

    const created = [];
    for (const field of renewFields) {
      try {
        const result = await this.createCustomField(field);
        created.push({ name: field.name, id: result.id, success: true });
        logger.info(`Custom Field erstellt: ${field.name} → ${result.id}`);
      } catch (error) {
        created.push({ name: field.name, success: false, error: error.message });
      }
    }

    return created;
  }
}

export const closeService = new CloseService();
export default closeService;
