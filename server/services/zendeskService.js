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
}

export const zendeskService = new ZendeskService();
export default zendeskService;
