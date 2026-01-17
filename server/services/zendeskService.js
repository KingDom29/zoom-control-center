/**
 * Zendesk Service
 * Erstellt Tickets über die Zendesk REST API
 */

import axios from 'axios';
import logger from '../utils/logger.js';

const ZENDESK_SUBDOMAIN = process.env.ZENDESK_SUBDOMAIN;
const ZENDESK_EMAIL = process.env.ZENDESK_EMAIL;
const ZENDESK_API_TOKEN = process.env.ZENDESK_API_TOKEN;

class ZendeskService {
  constructor() {
    this.baseUrl = `https://${ZENDESK_SUBDOMAIN}.zendesk.com/api/v2`;
    this.auth = Buffer.from(`${ZENDESK_EMAIL}/token:${ZENDESK_API_TOKEN}`).toString('base64');
  }

  /**
   * Prüft ob Zendesk konfiguriert ist
   */
  isConfigured() {
    return !!(ZENDESK_SUBDOMAIN && ZENDESK_EMAIL && ZENDESK_API_TOKEN);
  }

  /**
   * Erstellt ein Ticket
   */
  async createTicket(options) {
    if (!this.isConfigured()) {
      logger.warn('Zendesk nicht konfiguriert - Ticket wird übersprungen');
      return null;
    }

    const {
      subject,
      description,
      priority = 'normal', // low, normal, high, urgent
      type = 'task', // problem, incident, question, task
      tags = [],
      requesterEmail,
      requesterName,
      customFields = {}
    } = options;

    const ticketData = {
      ticket: {
        subject,
        comment: {
          html_body: description
        },
        priority,
        type,
        tags: ['maklerplan', 'auto-created', ...tags]
      }
    };

    // Requester hinzufügen wenn vorhanden
    if (requesterEmail) {
      ticketData.ticket.requester = {
        email: requesterEmail,
        name: requesterName || requesterEmail
      };
    }

    try {
      const response = await axios.post(
        `${this.baseUrl}/tickets.json`,
        ticketData,
        {
          headers: {
            'Authorization': `Basic ${this.auth}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const ticket = response.data.ticket;
      logger.info(`🎫 Zendesk Ticket #${ticket.id} erstellt: ${subject}`);
      
      return {
        id: ticket.id,
        url: `https://${ZENDESK_SUBDOMAIN}.zendesk.com/agent/tickets/${ticket.id}`,
        status: ticket.status
      };

    } catch (error) {
      logger.error('Zendesk Ticket Fehler', { 
        error: error.message, 
        details: error.response?.data 
      });
      throw error;
    }
  }

  /**
   * Erstellt ein HOT LEAD Ticket (urgent)
   */
  async createHotLeadTicket(lead, action) {
    const isUrgent = action === 'call';
    
    const actionLabels = {
      'call': '🔥 HOT LEAD - TERMIN GEWÜNSCHT',
      'info': '📄 Lead möchte mehr Infos',
      'optout': '❌ Lead abgemeldet',
      'quick-call': '🚀 SCHNELL-TERMIN',
      'urgent': '📞 DRINGENDER RÜCKRUF',
      'book': '📅 Buchung angefordert',
      'no-interest': '❌ Kein Interesse',
      'cancel': '🚫 Termin abgesagt'
    };

    const timestamp = new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });

    const description = `
<h2 style="color: ${isUrgent ? '#dc2626' : '#333'};">${actionLabels[action] || action}</h2>

<table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
  <tr>
    <td style="padding: 10px; border-bottom: 1px solid #eee; width: 150px;"><strong>Firma:</strong></td>
    <td style="padding: 10px; border-bottom: 1px solid #eee;">${lead.company || lead.name || lead.firma || '-'}</td>
  </tr>
  <tr>
    <td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>E-Mail:</strong></td>
    <td style="padding: 10px; border-bottom: 1px solid #eee;"><a href="mailto:${lead.email}">${lead.email}</a></td>
  </tr>
  <tr>
    <td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Telefon:</strong></td>
    <td style="padding: 10px; border-bottom: 1px solid #eee;">${lead.phone || lead.telefon || '-'}</td>
  </tr>
  <tr>
    <td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Website:</strong></td>
    <td style="padding: 10px; border-bottom: 1px solid #eee;">${lead.website ? `<a href="${lead.website}">${lead.website}</a>` : '-'}</td>
  </tr>
  <tr>
    <td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Bewertung:</strong></td>
    <td style="padding: 10px; border-bottom: 1px solid #eee;">⭐ ${lead.rating || '-'} (${lead.reviewCount || 0} Bewertungen)</td>
  </tr>
  <tr>
    <td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Ort:</strong></td>
    <td style="padding: 10px; border-bottom: 1px solid #eee;">${lead.city || lead.district || lead.address || '-'}</td>
  </tr>
  <tr>
    <td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Zeitpunkt:</strong></td>
    <td style="padding: 10px; border-bottom: 1px solid #eee;">${timestamp}</td>
  </tr>
</table>

${isUrgent ? '<p style="background: #fef2f2; padding: 15px; border-radius: 8px; color: #dc2626;"><strong>⚡ SOFORT ANRUFEN!</strong></p>' : ''}

<p style="color: #666; font-size: 12px; margin-top: 30px;">
  Automatisch erstellt vom Maklerplan Lead-System
</p>
    `.trim();

    return this.createTicket({
      subject: `${isUrgent ? '🚨 URGENT: ' : ''}${actionLabels[action]} - ${lead.company || lead.name || lead.firma}`,
      description,
      priority: isUrgent ? 'urgent' : 'high',
      type: 'task',
      tags: ['lead', action, isUrgent ? 'hot-lead' : 'warm-lead'],
      requesterEmail: lead.email,
      requesterName: lead.company || lead.name || lead.firma
    });
  }

  /**
   * Erstellt ein Kampagnen-Click Ticket
   */
  async createCampaignClickTicket(contact, action, meetingInfo = null) {
    const isUrgent = ['quick-call', 'urgent', 'cancel'].includes(action);
    
    const actionLabels = {
      'quick-call': '🚀 SCHNELL-TERMIN ANGEFORDERT',
      'urgent': '📞 DRINGENDER RÜCKRUF',
      'book': '📅 Buchung angefordert',
      'no-interest': '❌ Kein Interesse',
      'cancel': '🚫 Termin abgesagt'
    };

    const timestamp = new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });

    let meetingHtml = '';
    if (meetingInfo) {
      meetingHtml = `
  <tr>
    <td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Geplanter Termin:</strong></td>
    <td style="padding: 10px; border-bottom: 1px solid #eee;">${meetingInfo.date || '-'} um ${meetingInfo.time || '-'}</td>
  </tr>`;
    }

    const description = `
<h2 style="color: ${isUrgent ? '#dc2626' : '#333'};">${actionLabels[action] || action}</h2>

<table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
  <tr>
    <td style="padding: 10px; border-bottom: 1px solid #eee; width: 150px;"><strong>Kontakt:</strong></td>
    <td style="padding: 10px; border-bottom: 1px solid #eee;">${contact.anrede || ''} ${contact.vorname || ''} ${contact.name || ''}</td>
  </tr>
  <tr>
    <td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Firma:</strong></td>
    <td style="padding: 10px; border-bottom: 1px solid #eee;">${contact.firma || '-'}</td>
  </tr>
  <tr>
    <td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>E-Mail:</strong></td>
    <td style="padding: 10px; border-bottom: 1px solid #eee;"><a href="mailto:${contact.email}">${contact.email}</a></td>
  </tr>
  <tr>
    <td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Telefon:</strong></td>
    <td style="padding: 10px; border-bottom: 1px solid #eee;">${contact.telefon || '-'}</td>
  </tr>
  ${meetingHtml}
  <tr>
    <td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Zeitpunkt:</strong></td>
    <td style="padding: 10px; border-bottom: 1px solid #eee;">${timestamp}</td>
  </tr>
</table>

${isUrgent ? '<p style="background: #fef2f2; padding: 15px; border-radius: 8px; color: #dc2626;"><strong>⚡ SOFORT HANDELN!</strong></p>' : ''}

<p style="color: #666; font-size: 12px; margin-top: 30px;">
  Automatisch erstellt vom Maklerplan Kampagnen-System
</p>
    `.trim();

    return this.createTicket({
      subject: `${isUrgent ? '🚨 ' : ''}${actionLabels[action]} - ${contact.firma || contact.name}`,
      description,
      priority: isUrgent ? 'urgent' : 'normal',
      type: 'task',
      tags: ['kampagne', action, isUrgent ? 'urgent' : 'normal'],
      requesterEmail: contact.email,
      requesterName: `${contact.vorname || ''} ${contact.name || ''}`.trim() || contact.firma
    });
  }

  /**
   * Test-Ticket erstellen
   */
  async createTestTicket() {
    return this.createTicket({
      subject: '🧪 Test-Ticket vom Maklerplan System',
      description: `
<h2>Test-Ticket</h2>
<p>Dies ist ein automatisch erstelltes Test-Ticket vom Maklerplan System.</p>
<p><strong>Zeitpunkt:</strong> ${new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}</p>
<p>Wenn Sie dieses Ticket sehen, funktioniert die Zendesk-Integration! ✅</p>
      `.trim(),
      priority: 'low',
      type: 'task',
      tags: ['test']
    });
  }

  // ============================================
  // KUNDENAKTIVITÄTS-TRACKING
  // ============================================

  /**
   * Tickets eines Kunden abrufen (nach E-Mail)
   */
  async getCustomerTickets(email) {
    if (!this.isConfigured()) return { tickets: [], error: 'Zendesk nicht konfiguriert' };

    try {
      const response = await axios.get(
        `${this.baseUrl}/search.json?query=type:ticket requester:${encodeURIComponent(email)}`,
        {
          headers: {
            'Authorization': `Basic ${this.auth}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        tickets: response.data.results || [],
        count: response.data.count || 0
      };
    } catch (error) {
      logger.error('Zendesk Tickets abrufen Fehler', { email, error: error.message });
      return { tickets: [], error: error.message };
    }
  }

  /**
   * Ticket-Kommentare abrufen
   */
  async getTicketComments(ticketId) {
    if (!this.isConfigured()) return { comments: [] };

    try {
      const response = await axios.get(
        `${this.baseUrl}/tickets/${ticketId}/comments.json`,
        {
          headers: {
            'Authorization': `Basic ${this.auth}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return { comments: response.data.comments || [] };
    } catch (error) {
      logger.error('Zendesk Kommentare Fehler', { ticketId, error: error.message });
      return { comments: [], error: error.message };
    }
  }

  /**
   * ECHTE Kundenaktivität erkennen (keine Automatisierung)
   * Filtert nach: echten E-Mails, Telefonaten, Web-Eingaben
   */
  async getRealCustomerActivity(email, daysSince = 30) {
    if (!this.isConfigured()) return { activities: [], lastRealContact: null };

    try {
      const { tickets } = await this.getCustomerTickets(email);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysSince);

      const realActivities = [];

      for (const ticket of tickets) {
        // Prüfe Via-Channel - nur echte Kanäle
        const isRealChannel = ['email', 'web', 'phone', 'chat', 'voice'].includes(ticket.via?.channel);
        const isNotAutomated = !['api', 'trigger', 'automation', 'rule'].includes(ticket.via?.channel);
        
        if (isRealChannel && isNotAutomated) {
          // Hole Kommentare um echte Antworten zu finden
          const { comments } = await this.getTicketComments(ticket.id);
          
          for (const comment of comments) {
            const commentDate = new Date(comment.created_at);
            if (commentDate < cutoffDate) continue;

            // Ist es ein öffentlicher Kommentar vom Kunden (nicht Agent)?
            const isPublic = comment.public === true;
            const isFromCustomer = comment.via?.channel === 'email' || 
                                   (comment.author_id && !comment.via?.source?.from?.address?.includes('maklerplan'));
            const isRealComment = !['api', 'trigger', 'automation'].includes(comment.via?.channel);

            if (isPublic && isRealComment) {
              realActivities.push({
                type: comment.via?.channel || 'unknown',
                ticketId: ticket.id,
                ticketSubject: ticket.subject,
                date: comment.created_at,
                isFromCustomer,
                preview: comment.plain_body?.substring(0, 100) || ''
              });
            }
          }
        }

        // Telefonate erkennen (Channel = voice/phone)
        if (ticket.via?.channel === 'voice' || ticket.via?.channel === 'phone') {
          realActivities.push({
            type: 'phone_call',
            ticketId: ticket.id,
            ticketSubject: ticket.subject,
            date: ticket.created_at,
            isFromCustomer: true,
            preview: 'Telefonat'
          });
        }
      }

      // Sortieren nach Datum (neueste zuerst)
      realActivities.sort((a, b) => new Date(b.date) - new Date(a.date));

      return {
        email,
        activities: realActivities,
        totalReal: realActivities.length,
        lastRealContact: realActivities[0]?.date || null,
        daysSinceLastContact: realActivities[0] 
          ? Math.floor((Date.now() - new Date(realActivities[0].date)) / (1000 * 60 * 60 * 24))
          : null,
        isInactive: realActivities.length === 0 || 
          (realActivities[0] && (Date.now() - new Date(realActivities[0].date)) > daysSince * 24 * 60 * 60 * 1000)
      };
    } catch (error) {
      logger.error('Real Activity Check Fehler', { email, error: error.message });
      return { activities: [], lastRealContact: null, error: error.message };
    }
  }

  /**
   * Inaktive Kunden finden (kein echter Kontakt seit X Tagen)
   */
  async findInactiveCustomers(emails, inactiveDays = 30) {
    const inactive = [];
    
    for (const email of emails) {
      const activity = await this.getRealCustomerActivity(email, inactiveDays);
      if (activity.isInactive) {
        inactive.push({
          email,
          daysSinceLastContact: activity.daysSinceLastContact,
          lastContact: activity.lastRealContact
        });
      }
    }

    return {
      total: emails.length,
      inactive: inactive.length,
      customers: inactive
    };
  }

  /**
   * Alle Users abrufen
   */
  async searchUsers(query = '*', limit = 100) {
    if (!this.isConfigured()) return [];

    try {
      const response = await axios.get(`${this.baseUrl}/users.json`, {
        headers: { 'Authorization': `Basic ${this.auth}` },
        params: { per_page: Math.min(limit, 100) }
      });

      return response.data.users || [];
    } catch (error) {
      logger.error('Zendesk searchUsers Fehler', { error: error.message });
      return [];
    }
  }

  /**
   * Tickets abrufen
   */
  async getTickets(options = {}) {
    if (!this.isConfigured()) return [];

    try {
      const { limit = 100, status } = options;
      let url = `${this.baseUrl}/tickets.json`;
      
      if (status) {
        url = `${this.baseUrl}/search.json?query=type:ticket status:${status}`;
      }

      const response = await axios.get(url, {
        headers: { 'Authorization': `Basic ${this.auth}` },
        params: { per_page: Math.min(limit, 100) }
      });

      return response.data.tickets || response.data.results || [];
    } catch (error) {
      logger.error('Zendesk getTickets Fehler', { error: error.message });
      return [];
    }
  }
}

export const zendeskService = new ZendeskService();
export default zendeskService;
