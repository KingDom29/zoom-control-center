/**
 * Microsoft Graph Email Service
 * Sendet E-Mails über Microsoft 365 via Graph API
 */

import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js';
import logger from '../utils/logger.js';

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
  async sendEmail({ to, subject, body, isHtml = true, cc = [], bcc = [], attachments = [] }) {
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
  }
};

export const emailService = new EmailService();
export default emailService;
