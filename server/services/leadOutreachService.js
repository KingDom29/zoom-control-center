/**
 * Lead Outreach Service
 * Automatische E-Mail-Sequenz für Makler-Leads
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import logger from '../utils/logger.js';
import { emailService } from './emailService.js';
import { leadDatabase, LeadStatus, LeadPriority } from './leadDatabase.js';
import { googlePlacesService } from './googlePlaces.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTREACH_DB_PATH = path.join(__dirname, '../data/lead-outreach.json');
const TOKENS_PATH = path.join(__dirname, '../data/lead-tokens.json');
const QUEUE_PATH = path.join(__dirname, '../data/lead-queue.json');

// Konfiguration
const EMAILS_PER_HOUR = 5;  // Max 5 E-Mails pro Stunde
const DISTRICTS_PER_RUN = 1; // 1 Landkreis pro Durchlauf

// Token-Verwaltung (persistent)
let leadTokens = {};

function loadTokens() {
  try {
    if (fs.existsSync(TOKENS_PATH)) {
      leadTokens = JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf-8'));
      logger.info(`📂 ${Object.keys(leadTokens).length} Lead-Tokens geladen`);
    }
  } catch (e) {
    leadTokens = {};
  }
}

function saveTokens() {
  fs.writeFileSync(TOKENS_PATH, JSON.stringify(leadTokens, null, 2));
}

function generateLeadToken(leadId, action) {
  const token = crypto.randomBytes(16).toString('hex');
  leadTokens[token] = {
    leadId,
    action,
    createdAt: new Date().toISOString()
  };
  saveTokens();
  
  // Auto-expire nach 30 Tagen
  setTimeout(() => {
    delete leadTokens[token];
    saveTokens();
  }, 7 * 24 * 60 * 60 * 1000); // 7 Tage (safe für setTimeout)
  
  return token;
}

function getLeadTrackingUrl(leadId, action) {
  const token = generateLeadToken(leadId, action);
  const baseUrl = process.env.PUBLIC_URL || 'http://localhost:3001';
  return `${baseUrl}/api/leads/track/${action}/${token}`;
}

// Tokens beim Start laden
loadTokens();

// Rechtlich korrektes Impressum für alle E-Mails
const EMAIL_FOOTER = `
<div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; font-size: 11px; color: #666; line-height: 1.6;">
  <table style="width: 100%;">
    <tr>
      <td style="vertical-align: top; padding-right: 15px;">
        <p style="margin: 0 0 3px;"><strong>Maklerplan Pro GmbH</strong></p>
        <p style="margin: 0; font-size: 10px;">Französische Str. 20, 10117 Berlin<br>
        +49 30 219 25007 · HRB 264573 B, AG Berlin</p>
      </td>
      <td style="vertical-align: top;">
        <p style="margin: 0 0 3px;"><strong>Maklerplan GmbH</strong></p>
        <p style="margin: 0; font-size: 10px;">Grafenauweg 8, 6300 Zug, Schweiz<br>
        +41 41 510 61 00 · CHE-138.210.925</p>
      </td>
    </tr>
  </table>
  <p style="margin: 12px 0 0; font-size: 10px;">
    Geschäftsführer: Dominik Eisenhardt · 
    <a href="https://www.maklerplan.com" style="color: #667eea;">www.maklerplan.com</a> · 
    <a href="mailto:support@maklerplan.com" style="color: #667eea;">support@maklerplan.com</a>
  </p>
  <p style="margin: 10px 0 0; font-size: 10px;">
    <a href="{{optout_url}}" style="color: #999;">Abmelden</a> · 
    <a href="https://maklerplan.com/datenschutz" style="color: #999;">Datenschutz</a> · 
    <a href="https://maklerplan.com/impressum" style="color: #999;">Impressum</a>
  </p>
</div>
`.trim();

// Sequenz-Konfiguration: 7 E-Mails über 4 Wochen
const SEQUENCE_CONFIG = {
  steps: [
    { day: 0, template: 'step1_intro' },
    { day: 3, template: 'step2_value' },
    { day: 7, template: 'step3_social_proof' },
    { day: 11, template: 'step4_scarcity' },
    { day: 16, template: 'step5_case_study' },
    { day: 21, template: 'step6_last_chance' },
    { day: 28, template: 'step7_breakup' }
  ],
  totalEmails: 7,
  durationDays: 28
};

// E-Mail Templates für Lead-Outreach (7 Stufen) - KALTAKQUISE
// Angebot: 18% Tippgeberprovision, Anzahlungen werden verrechnet
const LEAD_TEMPLATES = {
  // STUFE 1: Intro (Tag 0) - Neugier wecken
  step1_intro: {
    subject: 'Verkaufsobjekte für {{firma}}?',
    body: `
<div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
  <p>{{anrede}},</p>
  
  <p>ich schreibe Ihnen, weil wir regelmäßig <strong>verkaufswillige Eigentümer in {{city}}</strong> haben – und einen zuverlässigen Makler vor Ort suchen.</p>
  
  <p>Kurz zu uns: <strong>Maklerplan</strong> vermittelt Verkaufsmandate an ausgewählte Makler. Unser Modell ist einfach:</p>
  
  <div style="background: #f0fdf4; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #22c55e;">
    <p style="margin: 0 0 10px; font-weight: 600;">💰 So verdienen Sie mit uns:</p>
    <ul style="margin: 0; padding-left: 20px;">
      <li>Wir liefern Ihnen qualifizierte Eigentümer-Leads</li>
      <li>Sie zahlen nur eine kleine Anzahlung pro Lead</li>
      <li><strong>18% Tippgeberprovision</strong> bei erfolgreichem Abschluss</li>
      <li>Alle Anzahlungen werden verrechnet – kein Risiko</li>
    </ul>
  </div>
  
  <p>Haben Sie 10 Minuten für ein kurzes Gespräch?</p>
  
  <div style="text-align: center; margin: 30px 0;">
    <a href="{{call_url}}" style="display: inline-block; background: #22c55e; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 5px;">
      ✅ Ja, rufen Sie mich an
    </a>
    <a href="https://booking.maklerplan.com" style="display: inline-block; background: #667eea; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 5px;">
      📅 Termin wählen
    </a>
  </div>
  
  <p style="color: #666; font-size: 14px; text-align: center;">
    <a href="{{optout_url}}" style="color: #999;">Kein Interesse</a>
  </p>
</div>
    `.trim()
  },

  // STUFE 2: Value Proposition (Tag 3) - Modell erklären
  step2_value: {
    subject: 'RE: Wie das Tippgeber-Modell funktioniert',
    body: `
<div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
  <p>{{anrede}},</p>
  
  <p>vielleicht fragen Sie sich: <em>Wo ist der Haken?</em></p>
  
  <p>Es gibt keinen. Unser Geschäftsmodell ist transparent:</p>
  
  <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 25px 0;">
    <table style="width: 100%; border-collapse: collapse;">
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 12px 0;"><strong>Sie erhalten:</strong></td>
        <td style="padding: 12px 0;">Qualifizierte Verkaufsmandate</td>
      </tr>
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 12px 0;"><strong>Sie zahlen:</strong></td>
        <td style="padding: 12px 0;">Kleine Anzahlung pro Lead</td>
      </tr>
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 12px 0;"><strong>Bei Abschluss:</strong></td>
        <td style="padding: 12px 0;"><strong style="color: #22c55e;">18% Tippgeberprovision</strong></td>
      </tr>
      <tr>
        <td style="padding: 12px 0;"><strong>Das Beste:</strong></td>
        <td style="padding: 12px 0;">Anzahlungen werden verrechnet</td>
      </tr>
    </table>
  </div>
  
  <p>Das bedeutet: Wenn ein Lead zum Abschluss führt, werden alle bisherigen Anzahlungen mit der Provision verrechnet. <strong>Sie zahlen effektiv nur bei Erfolg.</strong></p>
  
  <p>Interesse an Details?</p>
  
  <div style="text-align: center; margin: 30px 0;">
    <a href="{{call_url}}" style="display: inline-block; background: #22c55e; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 5px;">
      📞 Rückruf anfordern
    </a>
    <a href="https://booking.maklerplan.com" style="display: inline-block; background: #667eea; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 5px;">
      📅 Termin wählen
    </a>
  </div>
  
  <p style="margin: 20px 0 0;">Beste Grüße,<br><strong>Maklerplan-Team</strong></p>
</div>
    `.trim()
  },

  // STUFE 3: Social Proof (Tag 7) - Vertrauen aufbauen
  step3_social_proof: {
    subject: 'Warum Makler mit uns arbeiten',
    body: `
<div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
  <p>{{anrede}},</p>
  
  <p>wir arbeiten bereits mit über <strong>200 Maklern</strong> in ganz Deutschland zusammen. Hier ist, was sie schätzen:</p>
  
  <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 25px 0;">
    <p style="font-style: italic; margin: 0 0 10px;">"Die Leads sind echt – keine Zeitverschwendung. Und das Provisionsmodell ist fair: 18% nur bei Erfolg."</p>
    <p style="margin: 0; font-weight: 600; color: #666;">– Makler aus München, 3 Abschlüsse in 2 Monaten</p>
  </div>
  
  <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 25px 0;">
    <p style="font-style: italic; margin: 0 0 10px;">"Endlich ein Modell, bei dem ich nicht in Vorleistung gehe. Die Anzahlungen werden verrechnet – top!"</p>
    <p style="margin: 0; font-weight: 600; color: #666;">– Maklerin aus Frankfurt</p>
  </div>
  
  <p>Wollen Sie sehen, wie das für {{city}} aussehen könnte?</p>
  
  <div style="text-align: center; margin: 30px 0;">
    <a href="{{call_url}}" style="display: inline-block; background: #22c55e; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 5px;">
      ✅ Ja, Infos anfordern
    </a>
    <a href="https://booking.maklerplan.com" style="display: inline-block; background: #667eea; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 5px;">
      📅 Termin wählen
    </a>
  </div>
  
  <p style="margin: 20px 0 0;">Beste Grüße,<br><strong>Maklerplan-Team</strong></p>
</div>
    `.trim()
  },

  // STUFE 4: Konkretes Angebot (Tag 11)
  step4_scarcity: {
    subject: 'Konkret: So sieht ein Lead aus',
    body: `
<div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
  <p>{{anrede}},</p>
  
  <p>damit Sie sich etwas vorstellen können – hier ein Beispiel, wie unsere Leads aussehen:</p>
  
  <div style="background: #fef3c7; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #f59e0b;">
    <p style="margin: 0 0 10px; font-weight: 600;">📍 Beispiel-Lead {{city}}:</p>
    <ul style="margin: 0; padding-left: 20px;">
      <li><strong>Objekt:</strong> Einfamilienhaus, 140m²</li>
      <li><strong>Eigentümer:</strong> Ehepaar, 60+, Verkauf wg. Umzug</li>
      <li><strong>Zeitrahmen:</strong> Verkauf in 3-6 Monaten gewünscht</li>
      <li><strong>Kontakt:</strong> Telefonnummer + E-Mail verifiziert</li>
    </ul>
  </div>
  
  <div style="background: #f0fdf4; padding: 15px; border-radius: 8px; margin: 25px 0;">
    <p style="margin: 0;"><strong>Ihre Kosten:</strong> Kleine Anzahlung für den Lead</p>
    <p style="margin: 5px 0 0;"><strong>Ihr Gewinn bei Abschluss:</strong> Volle Provision abzgl. 18% Tippgeber</p>
    <p style="margin: 5px 0 0; color: #22c55e;"><strong>→ Anzahlungen werden verrechnet!</strong></p>
  </div>
  
  <p>Haben Sie gerade Kapazität für neue Objekte?</p>
  
  <div style="text-align: center; margin: 30px 0;">
    <a href="{{call_url}}" style="display: inline-block; background: #f59e0b; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 5px;">
      ⚡ Ja, Lead-Infos anfordern
    </a>
    <a href="https://booking.maklerplan.com" style="display: inline-block; background: #667eea; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 5px;">
      📅 Termin wählen
    </a>
  </div>
  
  <p style="margin: 20px 0 0;">Beste Grüße,<br><strong>Maklerplan-Team</strong></p>
</div>
    `.trim()
  },

  // STUFE 5: ROI Rechnung (Tag 16)
  step5_case_study: {
    subject: 'Rechenbeispiel: Was Sie verdienen können',
    body: `
<div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
  <p>{{anrede}},</p>
  
  <p>lassen Sie mich Ihnen eine einfache Rechnung zeigen:</p>
  
  <div style="background: #f0fdf4; padding: 20px; border-radius: 8px; margin: 25px 0;">
    <p style="font-weight: 600; margin: 0 0 15px; color: #166534;">📊 Beispielrechnung:</p>
    <table style="width: 100%;">
      <tr><td style="padding: 8px 0;"><strong>Verkaufspreis Objekt:</strong></td><td style="text-align: right;">400.000 €</td></tr>
      <tr><td style="padding: 8px 0;"><strong>Ihre Maklerprovision (3%):</strong></td><td style="text-align: right;">12.000 €</td></tr>
      <tr><td style="padding: 8px 0;"><strong>Abzgl. 18% Tippgeber:</strong></td><td style="text-align: right;">- 2.160 €</td></tr>
      <tr style="border-top: 2px solid #22c55e;"><td style="padding: 12px 0;"><strong style="color: #22c55e;">Ihr Gewinn:</strong></td><td style="text-align: right;"><strong style="color: #22c55e; font-size: 18px;">9.840 €</strong></td></tr>
    </table>
    <p style="margin: 15px 0 0; font-size: 13px; color: #666;">* Alle Anzahlungen werden mit der Provision verrechnet</p>
  </div>
  
  <p>Ohne Akquiseaufwand, ohne Kaltakquise, ohne Portalkosten.</p>
  
  <p>Wollen wir das für Ihre Region durchrechnen?</p>
  
  <div style="text-align: center; margin: 30px 0;">
    <a href="{{call_url}}" style="display: inline-block; background: #22c55e; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 5px;">
      📊 Meine Rechnung anfordern
    </a>
    <a href="https://booking.maklerplan.com" style="display: inline-block; background: #667eea; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 5px;">
      📅 Termin wählen
    </a>
  </div>
  
  <p style="margin: 20px 0 0;">Beste Grüße,<br><strong>Maklerplan-Team</strong></p>
</div>
    `.trim()
  },

  // STUFE 6: Last Chance (Tag 21)
  step6_last_chance: {
    subject: 'Kurze Frage, {{anrede_kurz}}',
    body: `
<div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
  <p>{{anrede}},</p>
  
  <p>ich habe Ihnen in den letzten Wochen unser Tippgeber-Modell vorgestellt.</p>
  
  <p>Vielleicht passt es gerade nicht – das ist völlig okay. Aber bevor ich aufhöre, eine ehrliche Frage:</p>
  
  <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 25px 0;">
    <p style="margin: 0; font-weight: 600;">Was hält Sie davon ab?</p>
  </div>
  
  <div style="margin: 25px 0;">
    <p style="margin: 10px 0;"><a href="{{call_url}}" style="color: #22c55e; text-decoration: none;">👉 Aktuell keine Kapazität – später gerne</a></p>
    <p style="margin: 10px 0;"><a href="{{info_url}}" style="color: #3b82f6; text-decoration: none;">👉 Brauche mehr Details zum Vertrag</a></p>
    <p style="margin: 10px 0;"><a href="{{optout_url}}" style="color: #999; text-decoration: none;">👉 Grundsätzlich kein Interesse</a></p>
  </div>
  
  <p>Ein Klick genügt.</p>
  
  <p style="margin: 20px 0 0;">Beste Grüße,<br><strong>Maklerplan-Team</strong></p>
</div>
    `.trim()
  },

  // STUFE 7: Breakup (Tag 28)
  step7_breakup: {
    subject: 'Meine letzte Mail, {{anrede_kurz}}',
    body: `
<div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
  <p>{{anrede}},</p>
  
  <p>dies ist meine letzte E-Mail an Sie.</p>
  
  <p>Ich verstehe, dass unser Tippgeber-Modell vielleicht nicht zu {{firma}} passt – oder der Zeitpunkt gerade ungünstig ist.</p>
  
  <p>Falls Sie in Zukunft doch Interesse an <strong>qualifizierten Verkaufsmandaten</strong> haben:</p>
  
  <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 25px 0; text-align: center;">
    <p style="margin: 0;"><strong>18% Tippgeberprovision · Anzahlungen werden verrechnet</strong></p>
  </div>
  
  <div style="text-align: center; margin: 30px 0;">
    <a href="{{call_url}}" style="display: inline-block; background: #6b7280; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 5px;">
      📞 Doch noch Kontakt aufnehmen
    </a>
    <a href="https://booking.maklerplan.com" style="display: inline-block; background: #667eea; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 5px;">
      📅 Termin wählen
    </a>
  </div>
  
  <p>Ansonsten wünsche ich Ihnen weiterhin viel Erfolg!</p>
  
  <p style="margin: 20px 0 0;">Alles Gute,<br><strong>Maklerplan-Team</strong></p>
  
  <p style="color: #999; font-size: 12px; margin-top: 30px;">
    Sie werden keine weiteren E-Mails von uns erhalten.
  </p>
</div>
    `.trim()
  },

  // INFO-SEQUENZ: Wenn jemand "Mehr Infos" klickt
  info_followup: {
    subject: '📄 Ihre angeforderten Infos zu Maklerplan',
    body: `
<div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
  <p>{{anrede}},</p>
  
  <p>vielen Dank für Ihr Interesse! Hier sind die wichtigsten Infos zu Maklerplan:</p>
  
  <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 25px 0;">
    <p style="font-weight: 600; margin: 0 0 15px;">🏠 Was ist Maklerplan?</p>
    <p style="margin: 0;">Wir generieren exklusive Eigentümer-Leads für Immobilienmakler. Sie erhalten vorqualifizierte Kontakte von Menschen, die ihre Immobilie verkaufen möchten – ohne Konkurrenz mit anderen Maklern.</p>
  </div>
  
  <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 25px 0;">
    <p style="font-weight: 600; margin: 0 0 15px;">💰 Was kostet das?</p>
    <p style="margin: 0;">Wir arbeiten auf Erfolgsbasis. Sie zahlen nur für Leads, die zu einem Abschluss führen. Kein Risiko für Sie.</p>
  </div>
  
  <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 25px 0;">
    <p style="font-weight: 600; margin: 0 0 15px;">📍 Wie funktioniert die Exklusivität?</p>
    <p style="margin: 0;">Pro Region arbeiten wir nur mit einer begrenzten Anzahl Makler. So garantieren wir, dass Sie keine Konkurrenz haben.</p>
  </div>
  
  <p><strong>Nächster Schritt:</strong> In einem kurzen 15-Minuten-Gespräch zeige ich Ihnen, wie viele potenzielle Verkäufer es in Ihrem Gebiet gibt.</p>
  
  <div style="text-align: center; margin: 30px 0;">
    <a href="{{call_url}}" style="display: inline-block; background: #22c55e; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 5px;">
      📞 Rückruf anfordern
    </a>
    <a href="https://booking.maklerplan.com" style="display: inline-block; background: #667eea; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 5px;">
      📅 Selbst Termin buchen
    </a>
  </div>
  
  <p style="margin: 20px 0 0;">Beste Grüße,<br><strong>Maklerplan-Team</strong></p>
</div>
    `.trim()
  }
};

class LeadOutreachService {
  constructor() {
    this.outreachData = this.loadOutreachData();
    this.queue = this.loadQueue();
  }

  loadOutreachData() {
    try {
      if (fs.existsSync(OUTREACH_DB_PATH)) {
        return JSON.parse(fs.readFileSync(OUTREACH_DB_PATH, 'utf-8'));
      }
    } catch (e) {
      logger.error('Error loading outreach data', { error: e.message });
    }
    return { 
      sequences: [], 
      optedOut: [],
      stats: { sent: 0, opened: 0, clicked: 0, converted: 0 }
    };
  }

  loadQueue() {
    try {
      if (fs.existsSync(QUEUE_PATH)) {
        return JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf-8'));
      }
    } catch (e) {
      logger.error('Error loading queue', { error: e.message });
    }
    return {
      currentDistrictIndex: 0,
      pendingLeads: [],
      lastProcessedAt: null,
      emailsSentThisHour: 0,
      hourStartedAt: null,
      totalDistrictsProcessed: 0,
      totalLeadsFound: 0,
      totalEmailsSent: 0
    };
  }

  saveQueue() {
    fs.writeFileSync(QUEUE_PATH, JSON.stringify(this.queue, null, 2));
  }

  saveOutreachData() {
    fs.writeFileSync(OUTREACH_DB_PATH, JSON.stringify(this.outreachData, null, 2));
  }

  /**
   * Startet Outreach für einen Lead (7 E-Mails über 4 Wochen)
   */
  async startSequence(lead) {
    // Prüfe ob bereits in Sequenz oder opted-out
    if (this.outreachData.optedOut.includes(lead.email)) {
      logger.info(`⏭️ ${lead.email} ist opted-out, überspringe`);
      return null;
    }

    const existingSequence = this.outreachData.sequences.find(
      s => s.leadId === lead.id || s.email === lead.email
    );
    if (existingSequence) {
      logger.info(`⏭️ ${lead.email} bereits in Sequenz`);
      return existingSequence;
    }

    // 7-Schritte-Sequenz basierend auf SEQUENCE_CONFIG erstellen
    const now = new Date();
    const steps = SEQUENCE_CONFIG.steps.map(step => ({
      template: step.template,
      day: step.day,
      scheduledAt: this.addDays(now, step.day).toISOString(),
      sentAt: null
    }));

    // Neue Sequenz erstellen
    const sequence = {
      id: crypto.randomUUID(),
      leadId: lead.id,
      email: lead.email,
      firma: lead.company || lead.name,
      city: lead.city || '',
      rating: lead.rating,
      reviewCount: lead.reviewCount,
      status: 'active', // active, paused, completed, converted, opted_out
      currentStep: 0,
      totalSteps: SEQUENCE_CONFIG.totalEmails,
      steps,
      clickedActions: [], // Tracking welche Buttons geklickt wurden
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.outreachData.sequences.push(sequence);
    this.saveOutreachData();

    // Erste E-Mail sofort senden
    await this.sendSequenceEmail(sequence, 0);

    return sequence;
  }

  /**
   * Stoppt eine Sequenz (bei Opt-out oder Conversion)
   */
  stopSequence(sequenceId, reason = 'manual') {
    const sequence = this.outreachData.sequences.find(s => s.id === sequenceId);
    if (!sequence) return null;

    sequence.status = reason === 'optout' ? 'opted_out' : 
                      reason === 'converted' ? 'converted' : 'completed';
    sequence.stoppedAt = new Date().toISOString();
    sequence.stoppedReason = reason;
    sequence.updatedAt = new Date().toISOString();
    this.saveOutreachData();

    logger.info(`⏹️ Sequenz gestoppt für ${sequence.email}: ${reason}`);
    return sequence;
  }

  /**
   * Wechselt Sequenz zu Info-Followup (wenn "Mehr Infos" geklickt)
   */
  async switchToInfoSequence(sequenceId) {
    const sequence = this.outreachData.sequences.find(s => s.id === sequenceId);
    if (!sequence || sequence.status !== 'active') return null;

    // Info-Mail sofort senden
    sequence.clickedActions.push({ action: 'info', at: new Date().toISOString() });
    sequence.updatedAt = new Date().toISOString();
    this.saveOutreachData();

    // Info-Template senden
    const template = LEAD_TEMPLATES.info_followup;
    const callUrl = getLeadTrackingUrl(sequence.leadId, 'call');
    const optoutUrl = getLeadTrackingUrl(sequence.leadId, 'optout');

    const variables = {
      anrede: 'Guten Tag',
      firma: sequence.firma,
      city: sequence.city,
      call_url: callUrl,
      optout_url: optoutUrl
    };

    try {
      const fullBody = this.replaceVariables(template.body, variables) + 
                       this.replaceVariables(EMAIL_FOOTER, variables);

      await emailService.sendEmail({
        to: sequence.email,
        replyTo: 'support@maklerplan.com',
        subject: this.replaceVariables(template.subject, variables),
        body: fullBody
      });
      logger.info(`📄 Info-Mail gesendet: ${sequence.email}`);
    } catch (e) {
      logger.error('Info-Mail Fehler', { error: e.message });
    }

    return sequence;
  }

  /**
   * Sendet E-Mail für einen Sequenz-Schritt
   */
  async sendSequenceEmail(sequence, stepIndex) {
    const step = sequence.steps[stepIndex];
    if (!step || step.sentAt) return;

    const template = LEAD_TEMPLATES[step.template];
    if (!template) return;

    // Tracking URLs generieren
    const callUrl = getLeadTrackingUrl(sequence.leadId, 'call');
    const infoUrl = getLeadTrackingUrl(sequence.leadId, 'info');
    const optoutUrl = getLeadTrackingUrl(sequence.leadId, 'optout');

    // Anrede bestimmen
    const anrede = 'Guten Tag';
    const anrede_kurz = 'Guten Tag'; // Kurze Form für Betreff

    // Template-Variablen
    const variables = {
      anrede,
      anrede_kurz,
      firma: sequence.firma,
      rating: sequence.rating?.toFixed(1) || '4.5',
      reviewCount: sequence.reviewCount || '50+',
      city: sequence.city || 'Ihrer Region',
      call_url: callUrl,
      info_url: infoUrl,
      optout_url: optoutUrl
    };

    try {
      // Body + rechtlich korrektes Impressum
      const fullBody = this.replaceVariables(template.body, variables) + 
                       this.replaceVariables(EMAIL_FOOTER, variables);

      await emailService.sendEmail({
        to: sequence.email,
        replyTo: 'support@maklerplan.com',
        subject: this.replaceVariables(template.subject, variables),
        body: fullBody
      });

      // Update sequence
      sequence.steps[stepIndex].sentAt = new Date().toISOString();
      sequence.currentStep = stepIndex + 1;
      sequence.updatedAt = new Date().toISOString();
      
      this.outreachData.stats.sent++;
      this.saveOutreachData();

      logger.info(`📧 Lead-E-Mail gesendet: ${sequence.email} (Step ${stepIndex + 1})`);

      // Lead-Status updaten
      leadDatabase.updateLead(sequence.leadId, {
        status: LeadStatus.CONTACTED,
        lastContactedAt: new Date().toISOString()
      });

    } catch (error) {
      logger.error(`Lead-E-Mail Fehler für ${sequence.email}`, { error: error.message });
    }
  }

  /**
   * Verarbeitet alle fälligen Sequenz-Schritte
   */
  async processSequences() {
    const now = new Date();
    let processed = 0;

    for (const sequence of this.outreachData.sequences) {
      if (sequence.status !== 'active') continue;

      for (let i = 0; i < sequence.steps.length; i++) {
        const step = sequence.steps[i];
        if (step.sentAt) continue;

        const scheduledAt = new Date(step.scheduledAt);
        if (scheduledAt <= now) {
          await this.sendSequenceEmail(sequence, i);
          processed++;
          await this.sleep(2000); // Rate limiting
          break; // Nur einen Schritt pro Durchlauf
        }
      }

      // Sequenz abgeschlossen?
      if (sequence.steps.every(s => s.sentAt)) {
        sequence.status = 'completed';
        this.saveOutreachData();
      }
    }

    if (processed > 0) {
      logger.info(`📬 ${processed} Lead-E-Mails verarbeitet`);
    }

    return processed;
  }

  /**
   * Verarbeitet Click-Tracking
   */
  handleClick(token) {
    const tokenData = leadTokens[token];
    if (!tokenData) return null;

    const { leadId, action } = tokenData;
    const lead = leadDatabase.getLeadById(leadId);
    
    if (!lead) return null;

    // Sequenz finden und updaten
    const sequence = this.outreachData.sequences.find(s => s.leadId === leadId);

    this.outreachData.stats.clicked++;

    // Aktion in Sequenz tracken
    if (sequence && sequence.clickedActions) {
      sequence.clickedActions.push({ action, at: new Date().toISOString() });
    }

    switch (action) {
      case 'call':
        // Hot Lead! → Sequenz STOPPEN
        leadDatabase.updateLead(leadId, {
          priority: LeadPriority.HOT,
          status: LeadStatus.MEETING_SCHEDULED
        });
        if (sequence) {
          sequence.status = 'converted';
          sequence.stoppedAt = new Date().toISOString();
          sequence.stoppedReason = 'call_clicked';
          logger.info(`🔥 HOT LEAD: ${lead.email} - Sequenz gestoppt`);
        }
        this.outreachData.stats.converted++;
        break;

      case 'info':
        // Interesse geweckt → Info-Mail senden, Sequenz PAUSIEREN
        leadDatabase.updateLead(leadId, {
          priority: LeadPriority.HIGH
        });
        if (sequence) {
          sequence.status = 'paused';
          sequence.pausedReason = 'info_requested';
          // Info-Mail wird separat gesendet (async)
          this.switchToInfoSequence(sequence.id);
          logger.info(`📄 INFO REQUESTED: ${lead.email} - Sequenz pausiert`);
        }
        break;

      case 'optout':
        // Kein Interesse → Sequenz STOPPEN
        this.outreachData.optedOut.push(lead.email);
        if (sequence) {
          sequence.status = 'opted_out';
          sequence.stoppedAt = new Date().toISOString();
          sequence.stoppedReason = 'optout_clicked';
          logger.info(`❌ OPT-OUT: ${lead.email} - Sequenz gestoppt`);
        }
        leadDatabase.updateLead(leadId, {
          status: LeadStatus.LOST,
          tags: [...(lead.tags || []), 'opted-out']
        });
        break;
    }

    if (sequence) {
      sequence.updatedAt = new Date().toISOString();
    }
    this.saveOutreachData();
    
    // Token invalidieren
    delete leadTokens[token];
    saveTokens();

    return { lead, action };
  }

  /**
   * Prüft und resettet das Stunden-Limit
   */
  checkHourlyLimit() {
    const now = new Date();
    const hourStart = this.queue.hourStartedAt ? new Date(this.queue.hourStartedAt) : null;
    
    // Neue Stunde?
    if (!hourStart || (now - hourStart) >= 60 * 60 * 1000) {
      this.queue.emailsSentThisHour = 0;
      this.queue.hourStartedAt = now.toISOString();
      this.saveQueue();
    }
    
    return this.queue.emailsSentThisHour < EMAILS_PER_HOUR;
  }

  /**
   * Fügt Leads zur Queue hinzu
   */
  addToQueue(leads) {
    for (const lead of leads) {
      // Duplikat-Check
      const exists = this.queue.pendingLeads.some(l => l.email === lead.email);
      const alreadySent = this.outreachData.sequences.some(s => s.email === lead.email);
      const optedOut = this.outreachData.optedOut.includes(lead.email);
      
      if (!exists && !alreadySent && !optedOut && lead.email) {
        this.queue.pendingLeads.push({
          ...lead,
          addedAt: new Date().toISOString()
        });
      }
    }
    this.saveQueue();
    return this.queue.pendingLeads.length;
  }

  /**
   * Verarbeitet nächsten Landkreis und fügt Leads zur Queue
   */
  async processNextDistrict() {
    const districts = googlePlacesService.getAllDistricts();
    
    if (this.queue.currentDistrictIndex >= districts.length) {
      logger.info('✅ Alle 400 Landkreise wurden verarbeitet!');
      return { done: true, districtIndex: this.queue.currentDistrictIndex };
    }

    const district = districts[this.queue.currentDistrictIndex];
    logger.info(`🔍 Verarbeite Landkreis ${this.queue.currentDistrictIndex + 1}/${districts.length}: ${district.name}`);

    try {
      const leads = await googlePlacesService.searchAllGermanDistricts({
        startIndex: this.queue.currentDistrictIndex,
        maxDistricts: DISTRICTS_PER_RUN,
        maxPerDistrict: 10,
        minRating: 4.2,
        onlyWithEmail: true
      });

      // In Lead-DB importieren
      const { imported } = leadDatabase.bulkImportFromPlaces(
        leads.map(l => ({
          place_id: l.place_id,
          name: l.name,
          formatted_address: l.address,
          formatted_phone_number: l.phone,
          website: l.website,
          email: l.email,
          rating: l.rating,
          user_ratings_total: l.reviewCount,
          district: l.district,
          state: l.state
        }))
      );

      // Zur Queue hinzufügen
      this.addToQueue(imported);
      
      this.queue.currentDistrictIndex++;
      this.queue.totalDistrictsProcessed++;
      this.queue.totalLeadsFound += imported.length;
      this.saveQueue();

      logger.info(`📍 ${district.name}: ${imported.length} Leads zur Queue hinzugefügt`);
      
      return {
        done: false,
        district: district.name,
        leadsFound: imported.length,
        queueSize: this.queue.pendingLeads.length,
        districtIndex: this.queue.currentDistrictIndex
      };

    } catch (error) {
      logger.error(`Fehler bei Landkreis ${district.name}`, { error: error.message });
      // Trotzdem weiter zum nächsten
      this.queue.currentDistrictIndex++;
      this.saveQueue();
      return { done: false, error: error.message };
    }
  }

  /**
   * Sendet E-Mails aus der Queue (max 5 pro Stunde)
   */
  async processQueue() {
    if (!this.checkHourlyLimit()) {
      logger.info(`⏳ Stunden-Limit erreicht (${EMAILS_PER_HOUR}/h). Warte auf nächste Stunde.`);
      return { sent: 0, remaining: this.queue.pendingLeads.length, limitReached: true };
    }

    const toSend = Math.min(
      EMAILS_PER_HOUR - this.queue.emailsSentThisHour,
      this.queue.pendingLeads.length
    );

    if (toSend === 0) {
      return { sent: 0, remaining: this.queue.pendingLeads.length };
    }

    let sent = 0;
    for (let i = 0; i < toSend; i++) {
      const lead = this.queue.pendingLeads.shift();
      if (!lead) break;

      try {
        // Lead in DB anlegen falls nicht vorhanden
        let dbLead = leadDatabase.getLeadByPlaceId(lead.place_id);
        if (!dbLead) {
          dbLead = leadDatabase.createLead({
            placeId: lead.place_id,
            name: lead.name,
            company: lead.name,
            address: lead.address,
            phone: lead.phone,
            email: lead.email,
            website: lead.website,
            rating: lead.rating,
            reviewCount: lead.reviewCount,
            city: lead.district,
            source: 'google_places'
          });
        }

        // Outreach starten
        await this.startSequence({
          ...dbLead,
          city: lead.district,
          rating: lead.rating,
          reviewCount: lead.reviewCount
        });

        sent++;
        this.queue.emailsSentThisHour++;
        this.queue.totalEmailsSent++;
        
        await this.sleep(5000); // 5 Sekunden zwischen E-Mails

      } catch (error) {
        logger.error(`Fehler beim Senden an ${lead.email}`, { error: error.message });
      }
    }

    this.queue.lastProcessedAt = new Date().toISOString();
    this.saveQueue();

    logger.info(`📬 ${sent} E-Mails gesendet. Queue: ${this.queue.pendingLeads.length} verbleibend`);
    
    return { 
      sent, 
      remaining: this.queue.pendingLeads.length,
      totalSent: this.queue.totalEmailsSent
    };
  }

  /**
   * Hauptfunktion: Verarbeitet Landkreise und sendet E-Mails
   */
  async runLeadGeneration(options = {}) {
    logger.info('🚀 Lead-Generierung gestartet...');

    try {
      // 1. Wenn Queue leer, nächsten Landkreis laden
      if (this.queue.pendingLeads.length < 10) {
        await this.processNextDistrict();
      }

      // 2. E-Mails aus Queue senden (max 5/Stunde)
      const result = await this.processQueue();

      logger.info(`✅ Lead-Generierung Durchlauf abgeschlossen`);

      return {
        ...result,
        currentDistrict: this.queue.currentDistrictIndex,
        totalDistricts: googlePlacesService.getAllDistricts().length,
        queueSize: this.queue.pendingLeads.length,
        stats: this.queue
      };

    } catch (error) {
      logger.error('Lead-Generierung Fehler', { error: error.message });
      throw error;
    }
  }

  /**
   * Queue-Status abrufen
   */
  getQueueStatus() {
    return {
      currentDistrictIndex: this.queue.currentDistrictIndex,
      totalDistricts: googlePlacesService.getAllDistricts().length,
      pendingLeads: this.queue.pendingLeads.length,
      emailsSentThisHour: this.queue.emailsSentThisHour,
      totalDistrictsProcessed: this.queue.totalDistrictsProcessed,
      totalLeadsFound: this.queue.totalLeadsFound,
      totalEmailsSent: this.queue.totalEmailsSent,
      lastProcessedAt: this.queue.lastProcessedAt
    };
  }

  /**
   * Queue zurücksetzen
   */
  resetQueue() {
    this.queue = {
      currentDistrictIndex: 0,
      pendingLeads: [],
      lastProcessedAt: null,
      emailsSentThisHour: 0,
      hourStartedAt: null,
      totalDistrictsProcessed: 0,
      totalLeadsFound: 0,
      totalEmailsSent: 0
    };
    this.saveQueue();
    return this.queue;
  }

  /**
   * Statistiken
   */
  getStats() {
    return {
      ...this.outreachData.stats,
      activeSequences: this.outreachData.sequences.filter(s => s.status === 'active').length,
      completedSequences: this.outreachData.sequences.filter(s => s.status === 'completed').length,
      optedOut: this.outreachData.optedOut.length
    };
  }

  replaceVariables(text, variables) {
    let result = text;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`{{${key}}}`, 'g'), value || '');
    }
    return result;
  }

  addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Exports
export const leadOutreachService = new LeadOutreachService();
export { leadTokens, getLeadTrackingUrl };
export default leadOutreachService;
