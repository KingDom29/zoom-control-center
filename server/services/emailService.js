/**
 * Microsoft Graph Email Service
 * Sendet E-Mails über Microsoft 365 via Graph API
 */

import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js';
import logger from '../utils/logger.js';
import { SEQUENCE_EMAIL_TEMPLATES } from '../templates/sequenceTemplates.js';

// Deutsche Feiertage 2026 (bundesweit)
const GERMAN_HOLIDAYS_2026 = [
  '2026-01-01', // Neujahr
  '2026-04-03', // Karfreitag
  '2026-04-06', // Ostermontag
  '2026-05-01', // Tag der Arbeit
  '2026-05-14', // Christi Himmelfahrt
  '2026-05-25', // Pfingstmontag
  '2026-10-03', // Tag der Deutschen Einheit
  '2026-12-25', // 1. Weihnachtstag
  '2026-12-26', // 2. Weihnachtstag
];

/**
 * Berechnet den nächsten Werktag (Mo-Fr, keine Feiertage)
 */
function getNextBusinessDay(fromDate = new Date()) {
  const date = new Date(fromDate);
  let daysToAdd = 1;
  
  // Wenn nach 17 Uhr, starten wir von morgen
  const hour = date.getHours();
  if (hour >= 17) {
    date.setDate(date.getDate() + 1);
  }
  
  // Prüfe nächste 10 Tage
  for (let i = 0; i < 10; i++) {
    const checkDate = new Date(date);
    checkDate.setDate(date.getDate() + daysToAdd);
    
    const dayOfWeek = checkDate.getDay();
    const dateStr = checkDate.toISOString().split('T')[0];
    
    // Wochenende überspringen
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      daysToAdd++;
      continue;
    }
    
    // Feiertag überspringen
    if (GERMAN_HOLIDAYS_2026.includes(dateStr)) {
      daysToAdd++;
      continue;
    }
    
    // Gültiger Werktag gefunden
    return { date: checkDate, daysAway: daysToAdd };
  }
  
  return { date: new Date(date.getTime() + 86400000), daysAway: 1 };
}

/**
 * Gibt menschenlesbaren Response-Text zurück
 */
function getResponseTimeText(urgent = false) {
  const now = new Date();
  const hour = now.getHours();
  const { daysAway } = getNextBusinessDay(now);
  
  // Dringend: Noch heute (wenn vor 16 Uhr)
  if (urgent && hour < 16) {
    return 'noch heute';
  }
  
  // Morgen ist Werktag
  if (daysAway === 1) {
    return 'morgen';
  }
  
  // Übermorgen
  if (daysAway === 2) {
    return 'am Montag'; // Wahrscheinlich Wochenende
  }
  
  // Mehr als 2 Tage (Feiertage)
  const nextDay = getNextBusinessDay(now);
  const options = { weekday: 'long' };
  return 'am ' + nextDay.date.toLocaleDateString('de-DE', options);
}

class EmailService {
  constructor() {
    this.client = null;
    this.fromEmail = process.env.EMAIL_FROM || 'support@maklerplan.com';
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    const tenantId = process.env.AZURE_TENANT_ID;
    const clientId = process.env.AZURE_CLIENT_ID;
    const clientSecret = process.env.AZURE_CLIENT_SECRET;

    if (!tenantId || !clientId || !clientSecret) {
      logger.warn('⚠️ Email Service: Azure credentials not configured');
      return;
    }

    try {
      const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
      
      const authProvider = new TokenCredentialAuthenticationProvider(credential, {
        scopes: ['https://graph.microsoft.com/.default']
      });

      this.client = Client.initWithMiddleware({ authProvider });
      this.initialized = true;
      logger.info('📧 Email Service initialized');
    } catch (error) {
      logger.error('Email Service initialization error', { error: error.message });
    }
  }

  /**
   * E-Mail senden
   */
  async sendEmail({ to, subject, body, isHtml = true, cc = [], bcc = [], replyTo = null, attachments = [] }) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.client) {
      throw new Error('Email Service nicht initialisiert - Azure Credentials prüfen');
    }

    const message = {
      subject,
      body: {
        contentType: isHtml ? 'HTML' : 'Text',
        content: body
      },
      toRecipients: this.formatRecipients(to),
      ccRecipients: this.formatRecipients(cc),
      bccRecipients: this.formatRecipients(bcc)
    };

    // Set reply-to address if specified
    if (replyTo) {
      message.replyTo = this.formatRecipients(replyTo);
    }

    if (attachments.length > 0) {
      message.attachments = attachments.map(att => ({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: att.name,
        contentType: att.contentType || 'application/octet-stream',
        contentBytes: att.contentBase64
      }));
    }

    try {
      await this.client
        .api(`/users/${this.fromEmail}/sendMail`)
        .post({ message, saveToSentItems: true });

      logger.info(`📧 Email sent to ${Array.isArray(to) ? to.join(', ') : to}`);
      
      return {
        success: true,
        to,
        subject,
        sentAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Send email error', { error: error.message });
      throw new Error(`Email senden fehlgeschlagen: ${error.message}`);
    }
  }

  /**
   * E-Mail mit Template senden
   */
  async sendTemplateEmail({ to, templateId, variables = {}, cc = [], bcc = [] }) {
    const template = EMAIL_TEMPLATES[templateId];
    if (!template) {
      throw new Error(`Template "${templateId}" nicht gefunden`);
    }

    const subject = this.replaceVariables(template.subject, variables);
    const body = this.replaceVariables(template.body, variables);

    return this.sendEmail({ to, subject, body, isHtml: true, cc, bcc });
  }

  /**
   * Bulk E-Mails senden (mit Rate Limiting)
   */
  async sendBulkEmails(emails, delayMs = 1000) {
    const results = [];
    
    for (const email of emails) {
      try {
        const result = await this.sendEmail(email);
        results.push({ ...result, status: 'sent' });
      } catch (error) {
        results.push({
          to: email.to,
          subject: email.subject,
          status: 'failed',
          error: error.message
        });
      }
      
      // Rate limiting
      if (delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    return {
      total: emails.length,
      sent: results.filter(r => r.status === 'sent').length,
      failed: results.filter(r => r.status === 'failed').length,
      results
    };
  }

  formatRecipients(recipients) {
    if (!recipients) return [];
    const list = Array.isArray(recipients) ? recipients : [recipients];
    return list.map(email => ({
      emailAddress: { address: email }
    }));
  }

  replaceVariables(text, variables) {
    let result = text;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`{{${key}}}`, 'g'), value || '');
    }
    return result;
  }

  /**
   * Test-Email senden
   */
  async sendTestEmail(to) {
    return this.sendEmail({
      to,
      subject: '✅ Maklerplan Email Test',
      body: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>🎉 Email-Service funktioniert!</h2>
          <p>Diese Test-Email wurde erfolgreich über Microsoft Graph API gesendet.</p>
          <p><strong>Timestamp:</strong> ${new Date().toLocaleString('de-DE')}</p>
          <hr>
          <p style="color: #666; font-size: 12px;">
            Maklerplan Control Center<br>
            support@maklerplan.com
          </p>
        </div>
      `
    });
  }

  /**
   * Inbox-Nachrichten abrufen
   */
  async getInboxMessages({ folder = 'inbox', limit = 50, filter = null, orderBy = 'receivedDateTime desc' } = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.client) {
      throw new Error('Email Service nicht initialisiert');
    }

    try {
      let request = this.client
        .api(`/users/${this.fromEmail}/mailFolders/${folder}/messages`)
        .top(limit)
        .orderby(orderBy)
        .select('id,subject,from,receivedDateTime,bodyPreview,isRead,conversationId');

      if (filter) {
        request = request.filter(filter);
      }

      const result = await request.get();
      
      logger.info(`📥 Inbox: ${result.value.length} Nachrichten abgerufen`);
      
      return result.value.map(msg => ({
        id: msg.id,
        subject: msg.subject,
        from: msg.from?.emailAddress?.address,
        fromName: msg.from?.emailAddress?.name,
        receivedAt: msg.receivedDateTime,
        preview: msg.bodyPreview,
        isRead: msg.isRead,
        conversationId: msg.conversationId
      }));
    } catch (error) {
      logger.error('Inbox read error', { error: error.message });
      throw new Error(`Inbox lesen fehlgeschlagen: ${error.message}`);
    }
  }

  /**
   * Einzelne E-Mail abrufen (mit Body)
   */
  async getMessage(messageId) {
    if (!this.initialized) await this.initialize();
    if (!this.client) throw new Error('Email Service nicht initialisiert');

    try {
      const msg = await this.client
        .api(`/users/${this.fromEmail}/messages/${messageId}`)
        .select('id,subject,from,receivedDateTime,body,isRead,conversationId')
        .get();

      return {
        id: msg.id,
        subject: msg.subject,
        from: msg.from?.emailAddress?.address,
        fromName: msg.from?.emailAddress?.name,
        receivedAt: msg.receivedDateTime,
        body: msg.body?.content,
        isRead: msg.isRead,
        conversationId: msg.conversationId
      };
    } catch (error) {
      logger.error('Get message error', { error: error.message });
      throw error;
    }
  }

  /**
   * Kampagnen-Antworten finden
   * Filtert Inbox nach Absender-Emails aus Kontaktliste
   */
  async getCampaignReplies(contactEmails, since = null) {
    if (!this.initialized) await this.initialize();
    if (!this.client) throw new Error('Email Service nicht initialisiert');

    try {
      // Inbox abrufen
      const messages = await this.getInboxMessages({ 
        limit: 200,
        filter: since ? `receivedDateTime ge ${since}` : null
      });

      // Nach Kontakt-Emails filtern
      const emailSet = new Set(contactEmails.map(e => e.toLowerCase()));
      const replies = messages.filter(msg => 
        msg.from && emailSet.has(msg.from.toLowerCase())
      );

      logger.info(`📨 Campaign Replies: ${replies.length} von ${messages.length} Nachrichten`);

      return {
        total: messages.length,
        campaignReplies: replies.length,
        replies: replies.map(r => ({
          ...r,
          contactEmail: r.from
        }))
      };
    } catch (error) {
      logger.error('Campaign replies error', { error: error.message });
      throw error;
    }
  }

  /**
   * Antworten nach Kontakt gruppieren
   */
  async getRepliesByContact(contacts) {
    const contactEmails = contacts.map(c => c.email).filter(Boolean);
    const { replies } = await this.getCampaignReplies(contactEmails);

    // Nach Kontakt zuordnen
    const emailToContact = {};
    contacts.forEach(c => {
      if (c.email) emailToContact[c.email.toLowerCase()] = c;
    });

    return replies.map(reply => ({
      ...reply,
      contact: emailToContact[reply.from?.toLowerCase()] || null
    }));
  }
}

// E-Mail Templates für Makler-Outreach
export const EMAIL_TEMPLATES = {
  // =============================================
  // NEUJAHRES-UPDATE 2026 KAMPAGNE
  // =============================================
  
  neujahr_einladung: {
    id: 'neujahr_einladung',
    name: 'Neujahres-Update 2026 - Einladung',
    subject: 'Kurzer Austausch zum Jahresstart? | Termin am {{datum}}',
    body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #fff; padding: 15px 20px; text-align: center; border: 1px solid #e0e0e0; border-bottom: none; border-radius: 8px 8px 0 0;">
          <span style="display: inline-block; width: 28px; height: 28px; background-color: #5CBF8E; border-radius: 4px; vertical-align: middle; margin-right: 8px; line-height: 28px; color: white; font-weight: bold; font-size: 16px;">M</span><span style="font-size: 20px; font-weight: 300; color: #105156; letter-spacing: 0.5px; vertical-align: middle;">MAKLER</span><span style="font-size: 20px; font-weight: 600; color: #5CBF8E; letter-spacing: 0.5px; vertical-align: middle;">PLAN</span>
        </div>
        <div style="background: #667eea; color: white; padding: 18px; text-align: center;">
          <h1 style="margin: 0; font-size: 20px; font-weight: 500;">Neujahres-Austausch 2026</h1>
        </div>
        
        <div style="padding: 25px; background: #fff; border: 1px solid #e0e0e0; border-top: none;">
          <p>{{anrede}},</p>
          
          <p>ein neues Jahr – und wir würden uns freuen, mal wieder persönlich mit Ihnen zu sprechen!</p>
          
          <p>Wir haben Ihnen einen Termin für ein kurzes Gespräch reserviert:</p>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea;">
            <p style="margin: 5px 0; font-size: 15px;"><strong>{{datum}}</strong></p>
            <p style="margin: 5px 0; font-size: 15px;"><strong>{{uhrzeit}} Uhr</strong> · ca. 30 Minuten · Zoom</p>
          </div>
          
          <p style="margin-bottom: 5px;"><strong>Worum geht's?</strong></p>
          <ul style="margin-top: 5px; line-height: 1.7; padding-left: 20px;">
            <li>Wie läuft's bei Ihnen?</li>
            <li>Ehrliches Feedback – wir wollen besser werden</li>
            <li>Falls gewünscht: Neues aus 2026 kurz zeigen</li>
          </ul>
          
          <div style="text-align: center; margin: 25px 0;">
            <a href="{{zoomLink}}" style="display: inline-block; background: #667eea; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px;">
              Termin bestätigen →
            </a>
          </div>
          
          <div style="background: #fff8e6; padding: 15px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #f5a623;">
            <p style="margin: 0;"><strong>Passt der Termin nicht?</strong></p>
            <p style="margin: 10px 0 0;">Kein Problem! Buchen Sie sich einfach einen anderen unter:<br>
            👉 <a href="https://booking.maklerplan.com" style="color: #667eea; font-weight: bold;">booking.maklerplan.com</a></p>
            <p style="margin: 10px 0 0;">Oder antworten Sie kurz – wir stornieren den Termin gerne für Sie.</p>
          </div>
          
          <p>Wir freuen uns, wenn es klappt!</p>
          
          <p style="margin-top: 30px;">
            Herzliche Grüße<br>
            Ihr Maklerplan Support Team<br>
            <strong>Herbert Nicklaus</strong>
          </p>
        </div>
        
        <div style="background: #f5f5f5; padding: 20px; text-align: center; font-size: 11px; color: #666; border-radius: 0 0 12px 12px; line-height: 1.6;">
          <strong>Maklerplan Pro GmbH</strong><br>
          Französische Str. 20, 10117 Berlin | +49 30 219 25007<br>
          HRB 264573 B, Amtsgericht Berlin<br><br>
          <strong>Maklerplan GmbH</strong><br>
          Grafenauweg 8, 6300 Zug, Schweiz | +41 41 510 61 00<br>
          CHE-138.210.925<br><br>
          Geschäftsführer: Dominik Eisenhardt<br>
          <a href="https://www.maklerplan.com" style="color: #667eea;">www.maklerplan.com</a> | 
          <a href="mailto:support@maklerplan.com" style="color: #667eea;">support@maklerplan.com</a>
        </div>
      </div>
    `
  },

  neujahr_erinnerung: {
    id: 'neujahr_erinnerung',
    name: 'Neujahres-Update 2026 - Erinnerung',
    subject: 'Kurze Erinnerung: Morgen um {{uhrzeit}} Uhr',
    body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #fff; padding: 15px 20px; text-align: center; border: 1px solid #e0e0e0; border-bottom: none; border-radius: 8px 8px 0 0;">
          <span style="display: inline-block; width: 28px; height: 28px; background-color: #5CBF8E; border-radius: 4px; vertical-align: middle; margin-right: 8px; line-height: 28px; color: white; font-weight: bold; font-size: 16px;">M</span><span style="font-size: 20px; font-weight: 300; color: #105156; letter-spacing: 0.5px; vertical-align: middle;">MAKLER</span><span style="font-size: 20px; font-weight: 600; color: #5CBF8E; letter-spacing: 0.5px; vertical-align: middle;">PLAN</span>
        </div>
        <div style="background: #2D8CFF; color: white; padding: 18px; text-align: center; border-radius: 0;">
          <h2 style="margin: 0; font-size: 18px; font-weight: 500;">Kurze Erinnerung</h2>
        </div>
        
        <div style="padding: 25px; background: #fff; border: 1px solid #e0e0e0; border-top: none;">
          <p>{{anrede}},</p>
          
          <p>nur eine kurze Erinnerung – morgen sprechen wir uns:</p>
          
          <p style="background: #f4f8fb; padding: 15px 20px; border-radius: 6px; margin: 20px 0; font-size: 15px;">
            <strong>{{datum}}</strong><br>
            {{uhrzeit}} Uhr · ca. 30 Minuten · Zoom
          </p>
          
          <div style="text-align: center; margin: 25px 0;">
            <a href="{{zoomLink}}" style="display: inline-block; background: #2D8CFF; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 15px;">
              Termin bestätigen →
            </a>
          </div>
          
          <p style="color: #666; font-size: 14px;">
            Kommt etwas dazwischen? Kein Problem – buchen Sie einen neuen Termin unter
            <a href="https://booking.maklerplan.com" style="color: #2D8CFF;">booking.maklerplan.com</a>
          </p>
          
          <p style="margin-top: 25px;">
            Herzliche Grüße<br>
            Ihr Maklerplan Support Team<br>
            <strong>Herbert Nicklaus</strong>
          </p>
        </div>
        
        <div style="background: #f5f5f5; padding: 20px; text-align: center; font-size: 11px; color: #666; border-radius: 0 0 8px 8px; line-height: 1.6;">
          <strong>Maklerplan Pro GmbH</strong><br>
          Französische Str. 20, 10117 Berlin | +49 30 219 25007<br>
          HRB 264573 B, Amtsgericht Berlin<br><br>
          <strong>Maklerplan GmbH</strong><br>
          Grafenauweg 8, 6300 Zug, Schweiz | +41 41 510 61 00<br>
          CHE-138.210.925<br><br>
          Geschäftsführer: Dominik Eisenhardt<br>
          <a href="https://www.maklerplan.com" style="color: #2D8CFF;">www.maklerplan.com</a> | 
          <a href="mailto:support@maklerplan.com" style="color: #2D8CFF;">support@maklerplan.com</a>
        </div>
      </div>
    `
  },

  noshow_followup: {
    id: 'noshow_followup',
    name: 'No-Show Follow-up',
    subject: 'Schade, wir haben Sie verpasst!',
    body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #fff; padding: 15px 20px; text-align: center; border: 1px solid #e0e0e0; border-bottom: none; border-radius: 8px 8px 0 0;">
          <span style="display: inline-block; width: 28px; height: 28px; background-color: #5CBF8E; border-radius: 4px; vertical-align: middle; margin-right: 8px; line-height: 28px; color: white; font-weight: bold; font-size: 16px;">M</span><span style="font-size: 20px; font-weight: 300; color: #105156; letter-spacing: 0.5px; vertical-align: middle;">MAKLER</span><span style="font-size: 20px; font-weight: 600; color: #5CBF8E; letter-spacing: 0.5px; vertical-align: middle;">PLAN</span>
        </div>
        <div style="background: #f5a623; color: white; padding: 18px; text-align: center;">
          <h2 style="margin: 0; font-size: 18px; font-weight: 500;">Wir haben Sie verpasst</h2>
        </div>
        
        <div style="padding: 25px; background: #fff; border: 1px solid #e0e0e0; border-top: none;">
          <p>{{anrede}},</p>
          
          <p>wir hatten uns auf das Gespräch mit Ihnen gefreut – leider konnten wir Sie nicht erreichen.</p>
          
          <p><strong>Kein Problem!</strong> Buchen Sie einfach einen neuen Termin:</p>
          
          <div style="text-align: center; margin: 25px 0;">
            <a href="https://booking.maklerplan.com" style="display: inline-block; background: #667eea; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px;">
              👉 Neuen Termin buchen
            </a>
          </div>
          
          <p style="color: #666;">Oder antworten Sie einfach auf diese E-Mail – wir finden einen passenden Zeitpunkt.</p>
          
          <p style="margin-top: 30px;">
            Herzliche Grüße<br>
            Ihr Maklerplan Support Team<br>
            <strong>Herbert Nicklaus</strong>
          </p>
        </div>
        
        <div style="background: #f5f5f5; padding: 20px; text-align: center; font-size: 11px; color: #666; border-radius: 0 0 8px 8px; line-height: 1.6;">
          <strong>Maklerplan Pro GmbH</strong><br>
          Französische Str. 20, 10117 Berlin | +49 30 219 25007<br>
          HRB 264573 B, Amtsgericht Berlin<br><br>
          <strong>Maklerplan GmbH</strong><br>
          Grafenauweg 8, 6300 Zug, Schweiz | +41 41 510 61 00<br>
          CHE-138.210.925<br><br>
          Geschäftsführer: Dominik Eisenhardt<br>
          <a href="https://www.maklerplan.com" style="color: #667eea;">www.maklerplan.com</a> | 
          <a href="mailto:support@maklerplan.com" style="color: #667eea;">support@maklerplan.com</a>
        </div>
      </div>
    `
  },

  neujahr_followup: {
    id: 'neujahr_followup',
    name: 'Neujahres-Update 2026 - Follow-up',
    subject: 'Danke für das Gespräch, {{vorname}}!',
    body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #fff; padding: 15px 20px; text-align: center; border: 1px solid #e0e0e0; border-bottom: none; border-radius: 8px 8px 0 0;">
          <span style="display: inline-block; width: 28px; height: 28px; background-color: #5CBF8E; border-radius: 4px; vertical-align: middle; margin-right: 8px; line-height: 28px; color: white; font-weight: bold; font-size: 16px;">M</span><span style="font-size: 20px; font-weight: 300; color: #105156; letter-spacing: 0.5px; vertical-align: middle;">MAKLER</span><span style="font-size: 20px; font-weight: 600; color: #5CBF8E; letter-spacing: 0.5px; vertical-align: middle;">PLAN</span>
        </div>
        <div style="background: #5CBF8E; color: white; padding: 18px; text-align: center;">
          <h2 style="margin: 0; font-size: 18px; font-weight: 500;">Danke für das Gespräch</h2>
        </div>
        
        <div style="padding: 25px; background: #fff; border: 1px solid #e0e0e0; border-top: none;">
          <p>{{anrede}},</p>
          
          <p>vielen Dank, dass Sie sich die Zeit genommen haben!</p>
          
          <p>Es war schön, mal wieder persönlich zu sprechen. Ihr Feedback hilft uns wirklich weiter.</p>
          
          <p style="background: #f4f8fb; padding: 15px 20px; border-radius: 6px; margin: 20px 0; font-size: 14px; color: #555;">
            <strong>Fragen oder Anregungen?</strong><br>
            <a href="mailto:support@maklerplan.com" style="color: #5CBF8E;">support@maklerplan.com</a> · +49 30 219 25007
          </p>
          
          <div style="text-align: center; margin: 25px 0;">
            <a href="mailto:support@maklerplan.com" style="display: inline-block; background: #5CBF8E; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 15px;">
              Bei Fragen melden →
            </a>
          </div>
          
          <p>Auf ein gutes 2026!</p>
          
          <p style="margin-top: 25px;">
            Herzliche Grüße<br>
            Ihr Maklerplan Support Team<br>
            <strong>Herbert Nicklaus</strong>
          </p>
        </div>
        
        <div style="background: #f5f5f5; padding: 20px; text-align: center; font-size: 11px; color: #666; border-radius: 0 0 8px 8px; line-height: 1.6;">
          <strong>Maklerplan Pro GmbH</strong><br>
          Französische Str. 20, 10117 Berlin | +49 30 219 25007<br>
          HRB 264573 B, Amtsgericht Berlin<br><br>
          <strong>Maklerplan GmbH</strong><br>
          Grafenauweg 8, 6300 Zug, Schweiz | +41 41 510 61 00<br>
          CHE-138.210.925<br><br>
          Geschäftsführer: Dominik Eisenhardt<br>
          <a href="https://www.maklerplan.com" style="color: #5CBF8E;">www.maklerplan.com</a> | 
          <a href="mailto:support@maklerplan.com" style="color: #5CBF8E;">support@maklerplan.com</a>
        </div>
      </div>
    `
  },

  // =============================================
  // STANDARD TEMPLATES
  // =============================================

  erstansprache: {
    id: 'erstansprache',
    name: 'Erstansprache Makler',
    subject: 'Digitale Tools für {{company}} - Kurzes Gespräch?',
    body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <p>Sehr geehrte Damen und Herren von {{company}},</p>
        
        <p>ich bin auf Ihr Maklerbüro aufmerksam geworden und beeindruckt von 
        {{rating_text}}.</p>
        
        <p>Wir bei Maklerplan entwickeln digitale Lösungen speziell für Immobilienmakler, 
        die den Arbeitsalltag erheblich vereinfachen:</p>
        
        <ul>
          <li>📊 Automatisierte Exposé-Erstellung</li>
          <li>📅 Intelligente Terminplanung</li>
          <li>📱 Digitale Besichtigungen</li>
          <li>📈 Lead-Management & CRM</li>
        </ul>
        
        <p>Hätten Sie diese Woche <strong>15 Minuten</strong> Zeit für ein kurzes 
        Telefonat oder Video-Call? Ich zeige Ihnen gerne, wie andere Maklerbüros 
        in {{location}} bereits davon profitieren.</p>
        
        <p>Wann passt es Ihnen am besten?</p>
        
        <p>Mit freundlichen Grüßen<br>
        <strong>{{sender_name}}</strong><br>
        Maklerplan<br>
        {{sender_phone}}</p>
      </div>
    `
  },

  termineinladung: {
    id: 'termineinladung',
    name: 'Meeting-Einladung',
    subject: '📅 Unser Termin am {{meeting_date}} - {{company}}',
    body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <p>Sehr geehrte/r {{contact_name}},</p>
        
        <p>vielen Dank für Ihr Interesse! Ich freue mich auf unser Gespräch.</p>
        
        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0;">📅 Termindetails</h3>
          <p><strong>Datum:</strong> {{meeting_date}}<br>
          <strong>Uhrzeit:</strong> {{meeting_time}} Uhr<br>
          <strong>Dauer:</strong> {{meeting_duration}} Minuten<br>
          <strong>Format:</strong> Video-Call (Zoom)</p>
          
          <a href="{{join_url}}" style="display: inline-block; background: #2D8CFF; color: white; 
             padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 10px;">
            🎥 Zum Meeting beitreten
          </a>
        </div>
        
        <p><strong>Was wir besprechen:</strong></p>
        <ul>
          <li>Ihre aktuelle Situation & Herausforderungen</li>
          <li>Wie Maklerplan Ihnen helfen kann</li>
          <li>Live-Demo der wichtigsten Features</li>
        </ul>
        
        <p>Falls Sie den Termin verschieben müssen, antworten Sie einfach auf diese E-Mail.</p>
        
        <p>Bis bald!<br>
        <strong>{{sender_name}}</strong></p>
      </div>
    `
  },

  nachfassen: {
    id: 'nachfassen',
    name: 'Follow-Up nach Meeting',
    subject: 'Danke für das Gespräch, {{contact_name}}! 🤝',
    body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <p>Hallo {{contact_name}},</p>
        
        <p>vielen Dank für das tolle Gespräch heute! Es war sehr interessant, mehr über 
        {{company}} zu erfahren.</p>
        
        <p><strong>Wie besprochen:</strong></p>
        <ul>
          {{action_items}}
        </ul>
        
        <p>Ich melde mich {{next_step_date}} wieder bei Ihnen.</p>
        
        <p>Falls Sie vorher Fragen haben, erreichen Sie mich jederzeit unter 
        {{sender_phone}} oder per E-Mail.</p>
        
        <p>Beste Grüße<br>
        <strong>{{sender_name}}</strong><br>
        Maklerplan</p>
      </div>
    `
  },

  erinnerung: {
    id: 'erinnerung',
    name: 'Meeting-Erinnerung',
    subject: '⏰ Erinnerung: Unser Termin morgen um {{meeting_time}} Uhr',
    body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <p>Hallo {{contact_name}},</p>
        
        <p>nur eine kurze Erinnerung an unser morgiges Meeting:</p>
        
        <div style="background: #e8f4fd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2D8CFF;">
          <p style="margin: 0;"><strong>📅 {{meeting_date}}</strong><br>
          <strong>🕐 {{meeting_time}} Uhr</strong><br>
          <strong>⏱️ {{meeting_duration}} Minuten</strong></p>
        </div>
        
        <a href="{{join_url}}" style="display: inline-block; background: #2D8CFF; color: white; 
           padding: 12px 24px; text-decoration: none; border-radius: 6px;">
          🎥 Zoom-Link öffnen
        </a>
        
        <p style="margin-top: 20px;">Bis morgen!<br>
        <strong>{{sender_name}}</strong></p>
      </div>
    `
  },

  angebot: {
    id: 'angebot',
    name: 'Angebot zusenden',
    subject: 'Ihr persönliches Angebot von Maklerplan 📋',
    body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <p>Sehr geehrte/r {{contact_name}},</p>
        
        <p>wie besprochen sende ich Ihnen unser Angebot für {{company}}:</p>
        
        <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #2D8CFF;">{{package_name}}</h3>
          <p>{{package_description}}</p>
          <p style="font-size: 24px; font-weight: bold; color: #333;">{{price}} €/Monat</p>
          <p style="color: #666; font-size: 14px;">{{price_note}}</p>
        </div>
        
        <p><strong>Enthaltene Leistungen:</strong></p>
        <ul>
          {{features_list}}
        </ul>
        
        <p>Das Angebot ist gültig bis {{valid_until}}.</p>
        
        <p>Bei Fragen stehe ich Ihnen jederzeit zur Verfügung.</p>
        
        <p>Mit freundlichen Grüßen<br>
        <strong>{{sender_name}}</strong><br>
        {{sender_phone}}</p>
      </div>
    `
  },

  // =============================================
  // RE-ENGAGEMENT TEMPLATES
  // =============================================

  reengagement_late: {
    id: 'reengagement_late',
    name: 'Re-Engagement - Später Termin',
    subject: 'Ehrlich gesagt: Wir haben übertrieben 🙈',
    body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #fff; padding: 15px 20px; text-align: center; border: 1px solid #e0e0e0; border-bottom: none; border-radius: 8px 8px 0 0;">
          <span style="display: inline-block; width: 28px; height: 28px; background-color: #5CBF8E; border-radius: 4px; vertical-align: middle; margin-right: 8px; line-height: 28px; color: white; font-weight: bold; font-size: 16px;">M</span><span style="font-size: 20px; font-weight: 300; color: #105156; letter-spacing: 0.5px; vertical-align: middle;">MAKLER</span><span style="font-size: 20px; font-weight: 600; color: #5CBF8E; letter-spacing: 0.5px; vertical-align: middle;">PLAN</span>
        </div>
        
        <div style="padding: 25px; background: #fff; border: 1px solid #e0e0e0; border-top: none;">
          <p>{{anrede}},</p>
          
          <p>kurz und ehrlich: <strong>Wir haben einen Fehler gemacht.</strong></p>
          
          <p>Sie haben eine Einladung zum "Neujahres-Update" bekommen – aber Ihr Termin ist erst im <strong>{{monat}}</strong>. Das passt natürlich nicht zusammen.</p>
          
          <div style="background: #fff8e6; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f5a623;">
            <p style="margin: 0;"><strong>Deshalb unser Angebot:</strong></p>
            <p style="margin: 10px 0 0;">Wir können auch <strong>kurzfristig</strong> sprechen – diese oder nächste Woche, auch samstags.</p>
          </div>
          
          <p><strong>Was würde Ihnen am meisten helfen?</strong></p>
          
          <div style="margin: 20px 0;">
            <a href="{{quick_call_url}}" style="display: inline-block; background: #e74c3c; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 5px 5px 5px 0; font-weight: 600;">
              🚀 Schnell-Termin (diese Woche)
            </a>
            <a href="https://booking.maklerplan.com" style="display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 5px; font-weight: 600;">
              📅 Selbst buchen
            </a>
          </div>
          
          <div style="margin: 20px 0;">
            <a href="mailto:support@maklerplan.com?subject=Frage von {{firma}}" style="display: inline-block; background: #3498db; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 5px 5px 5px 0;">
              📧 Frage per E-Mail
            </a>
            <a href="{{no_interest_url}}" style="display: inline-block; background: #95a5a6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 5px;">
              ❌ Kein Bedarf
            </a>
          </div>
          
          <p style="color: #666; font-size: 14px; margin-top: 25px;">
            Oder antworten Sie einfach auf diese E-Mail – wir melden uns persönlich.
          </p>
          
          <p style="margin-top: 30px;">
            Herzliche Grüße<br>
            <strong>Herbert Nicklaus</strong><br>
            Maklerplan Team
          </p>
        </div>
        
        <div style="background: #f5f5f5; padding: 15px; text-align: center; font-size: 11px; color: #666; border-radius: 0 0 8px 8px;">
          Maklerplan · support@maklerplan.com · +49 30 219 25007
        </div>
      </div>
    `
  },

  emergency_call_request: {
    id: 'emergency_call_request',
    name: 'Emergency Call Bestätigung',
    subject: '✅ Rückruf-Anfrage erhalten - {{firma}}',
    body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #5CBF8E; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0;">✅ Anfrage erhalten!</h2>
        </div>
        
        <div style="padding: 25px; background: #fff; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">
          <p>{{anrede}},</p>
          
          <p>Ihre Rückruf-Anfrage ist bei uns eingegangen.</p>
          
          <div style="background: #e8f5e9; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Wir melden uns innerhalb der nächsten 2 Stunden.</strong></p>
          </div>
          
          <p>Falls Sie uns nicht erreichen können, rufen Sie gerne direkt an:<br>
          📞 <strong>+49 30 219 25007</strong></p>
          
          <p>Bis gleich!<br>
          Ihr Maklerplan Team</p>
        </div>
      </div>
    `
  },

  ...SEQUENCE_EMAIL_TEMPLATES,

  // =============================================
  // AUTO-REPLY TEMPLATES
  // =============================================

  auto_reply_reschedule: {
    id: 'auto_reply_reschedule',
    name: 'Auto-Reply - Termin verschieben',
    subject: 'Re: Terminverschiebung für {{firma}}',
    body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <p>{{anrede}},</p>
        
        <p>vielen Dank für Ihre Nachricht!</p>
        
        <p>Kein Problem – wir können den Termin gerne verschieben.</p>
        
        <p><strong>Buchen Sie einfach einen neuen Termin:</strong></p>
        <p><a href="https://booking.maklerplan.com" style="display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">📅 Neuen Termin wählen</a></p>
        
        <p>Oder nennen Sie uns 2-3 alternative Termine – wir melden uns umgehend.</p>
        
        <p>Herzliche Grüße<br>
        <strong>Ihr Maklerplan Team</strong><br>
        📞 +49 30 219 25007</p>
      </div>
    `
  },

  auto_reply_question: {
    id: 'auto_reply_question',
    name: 'Auto-Reply - Frage erhalten',
    subject: 'Re: Ihre Anfrage - {{firma}}',
    body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <p>{{anrede}},</p>
        
        <p>vielen Dank für Ihre Nachricht!</p>
        
        <p>Wir haben Ihre Anfrage erhalten und melden uns <strong>{{response_time}}</strong> mit einer ausführlichen Antwort.</p>
        
        <p>Falls es dringend ist, erreichen Sie uns direkt unter:<br>
        📞 <strong>+49 30 219 25007</strong></p>
        
        <p>Herzliche Grüße<br>
        <strong>Ihr Maklerplan Team</strong></p>
      </div>
    `
  },

  auto_reply_cancel: {
    id: 'auto_reply_cancel',
    name: 'Auto-Reply - Kündigung/Absage',
    subject: 'Re: Ihre Nachricht - {{firma}}',
    body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <p>{{anrede}},</p>
        
        <p>vielen Dank für Ihre Nachricht.</p>
        
        <p>Wir haben Ihr Anliegen an unseren Kundendienst weitergeleitet. Sie erhalten <strong>{{response_time}}</strong> eine Bestätigung.</p>
        
        <p>Bei dringenden Fragen erreichen Sie uns unter:<br>
        📞 <strong>+49 30 219 25007</strong></p>
        
        <p>Mit freundlichen Grüßen<br>
        <strong>Ihr Maklerplan Team</strong></p>
      </div>
    `
  },

  auto_reply_positive: {
    id: 'auto_reply_positive',
    name: 'Auto-Reply - Interesse',
    subject: 'Re: {{firma}} - Wir freuen uns!',
    body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <p>{{anrede}},</p>
        
        <p>vielen Dank für Ihre positive Rückmeldung! 🎉</p>
        
        <p>Wir melden uns <strong>{{response_time}}</strong> bei Ihnen, um alles Weitere zu besprechen.</p>
        
        <p><strong>Falls Sie nicht warten möchten:</strong></p>
        <p><a href="https://booking.maklerplan.com" style="display: inline-block; background: #5CBF8E; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">📅 Jetzt Termin buchen</a></p>
        
        <p>Bis bald!<br>
        <strong>Ihr Maklerplan Team</strong><br>
        📞 +49 30 219 25007</p>
      </div>
    `
  },

  // Daily Report Template
  daily_report: {
    id: 'daily_report',
    name: 'Täglicher Kampagnen-Report',
    subject: '📊 Kampagnen-Report {{datum}}',
    body: `
      <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 25px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">📊 Täglicher Kampagnen-Report</h1>
          <p style="margin: 10px 0 0; opacity: 0.9;">{{datum}}</p>
        </div>
        
        <div style="padding: 25px; background: #fff; border: 1px solid #e0e0e0; border-top: none;">
          
          <h2 style="color: #333; border-bottom: 2px solid #667eea; padding-bottom: 10px;">📬 Heute versendet</h2>
          <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee;">Einladungen</td><td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold;">{{today_invitations}}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee;">Erinnerungen</td><td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold;">{{today_reminders}}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee;">Re-Engagement</td><td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold;">{{today_reengagement}}</td></tr>
          </table>
          
          <h2 style="color: #333; border-bottom: 2px solid #5CBF8E; padding-bottom: 10px;">🔔 Aktionen heute</h2>
          <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee;">Button-Klicks</td><td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold;">{{today_clicks}}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee;">Email-Antworten</td><td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold;">{{today_replies}}</td></tr>
            <tr style="background: #fff3cd;"><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>🚨 Urgent Requests</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold; color: #e74c3c;">{{urgent_requests}}</td></tr>
          </table>
          
          <h2 style="color: #333; border-bottom: 2px solid #3498db; padding-bottom: 10px;">📈 Gesamt-Übersicht</h2>
          <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee;">Kontakte gesamt</td><td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">{{total_contacts}}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee;">Einladungen gesendet</td><td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">{{total_invitations}}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee;">Re-Engagement gesendet</td><td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">{{total_reengagement}}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee;">Re-Engagement ausstehend</td><td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">{{pending_reengagement}}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee;">Antworten erhalten</td><td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">{{total_replies}}</td></tr>
          </table>
          
          {{urgent_section}}
          
          <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin-top: 20px; text-align: center;">
            <a href="http://localhost:3001/api/campaign/daily-report" style="color: #667eea; text-decoration: none;">📊 Live-Dashboard öffnen</a>
          </div>
        </div>
        
        <div style="background: #f5f5f5; padding: 15px; text-align: center; font-size: 11px; color: #666; border-radius: 0 0 8px 8px;">
          Automatisch generiert · Maklerplan Kampagnen-System
        </div>
      </div>
    `
  }
};

export const emailService = new EmailService();
export { getResponseTimeText, getNextBusinessDay };
export default emailService;
