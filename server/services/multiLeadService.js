/**
 * Multi-Branchen Lead Generation Service
 * Lead-Fabrik für alle Branchen (Handwerker, Berater, Dienstleister)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import crypto from 'crypto';
import logger from '../utils/logger.js';
import { emailService } from './emailService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MULTI_LEADS_PATH = path.join(__dirname, '../data/multi-leads.json');
const MULTI_TOKENS_PATH = path.join(__dirname, '../data/multi-tokens.json');
const GOOGLE_PLACES_URL = 'https://maps.googleapis.com/maps/api/place';

// =============================================
// BRANCHEN-KONFIGURATION
// =============================================

const BRANCHES = {
  // Handwerk
  gaertner: {
    id: 'gaertner',
    name: 'Gärtner & Landschaftsbau',
    googleType: 'landscaper',
    keywords: ['Gärtner', 'Landschaftsbau', 'Gartenpflege', 'Garten- und Landschaftsbau'],
    emoji: '🌿',
    painPoints: ['Kundenakquise', 'Saisonale Schwankungen', 'Online-Sichtbarkeit']
  },
  maler: {
    id: 'maler',
    name: 'Maler & Lackierer',
    googleType: 'painter',
    keywords: ['Maler', 'Malerbetrieb', 'Lackierer', 'Malermeister'],
    emoji: '🎨',
    painPoints: ['Preiskampf', 'Fachkräftemangel', 'Auftragsakquise']
  },
  fliesenleger: {
    id: 'fliesenleger',
    name: 'Fliesenleger',
    googleType: 'general_contractor',
    keywords: ['Fliesenleger', 'Fliesenarbeiten', 'Fliesen'],
    emoji: '🔲',
    painPoints: ['Wettbewerb', 'Materialkosten', 'Kundengewinnung']
  },
  elektriker: {
    id: 'elektriker',
    name: 'Elektriker',
    googleType: 'electrician',
    keywords: ['Elektriker', 'Elektrofirma', 'Elektroinstallation'],
    emoji: '⚡',
    painPoints: ['Notdienst-Anfragen', 'Preisgestaltung', 'Digitalisierung']
  },
  klempner: {
    id: 'klempner',
    name: 'Klempner & Sanitär',
    googleType: 'plumber',
    keywords: ['Klempner', 'Sanitär', 'Heizung Sanitär', 'Installateur'],
    emoji: '🔧',
    painPoints: ['24/7 Erreichbarkeit', 'Kundenbewertungen', 'Effizienz']
  },
  dachdecker: {
    id: 'dachdecker',
    name: 'Dachdecker',
    googleType: 'roofing_contractor',
    keywords: ['Dachdecker', 'Dachdeckerei', 'Dacharbeiten'],
    emoji: '🏠',
    painPoints: ['Wetter-Abhängigkeit', 'Großprojekte', 'Versicherung']
  },
  schreiner: {
    id: 'schreiner',
    name: 'Schreiner & Tischler',
    googleType: 'carpenter',
    keywords: ['Schreiner', 'Tischler', 'Schreinerei', 'Tischlerei'],
    emoji: '🪚',
    painPoints: ['Materialkosten', 'Individualisierung', 'Lieferzeiten']
  },
  
  // Dienstleister
  steuerberater: {
    id: 'steuerberater',
    name: 'Steuerberater',
    googleType: 'accounting',
    keywords: ['Steuerberater', 'Steuerkanzlei', 'Steuerberatung'],
    emoji: '📊',
    painPoints: ['Mandantenakquise', 'Digitalisierung', 'Fachkräfte']
  },
  rechtsanwalt: {
    id: 'rechtsanwalt',
    name: 'Rechtsanwälte',
    googleType: 'lawyer',
    keywords: ['Rechtsanwalt', 'Anwalt', 'Kanzlei', 'Anwaltskanzlei'],
    emoji: '⚖️',
    painPoints: ['Mandantengewinnung', 'Spezialisierung', 'Marketing']
  },
  unternehmensberater: {
    id: 'unternehmensberater',
    name: 'Unternehmensberater',
    googleType: 'business_consultant',
    keywords: ['Unternehmensberater', 'Consulting', 'Beratung'],
    emoji: '💼',
    painPoints: ['Lead-Generierung', 'Positionierung', 'Skalierung']
  },
  versicherung: {
    id: 'versicherung',
    name: 'Versicherungsmakler',
    googleType: 'insurance_agency',
    keywords: ['Versicherungsmakler', 'Versicherung', 'Finanzberater'],
    emoji: '🛡️',
    painPoints: ['Vertrauen aufbauen', 'Online-Präsenz', 'Empfehlungen']
  },
  
  // Gesundheit & Wellness
  zahnarzt: {
    id: 'zahnarzt',
    name: 'Zahnärzte',
    googleType: 'dentist',
    keywords: ['Zahnarzt', 'Zahnarztpraxis', 'Dental'],
    emoji: '🦷',
    painPoints: ['Patientenakquise', 'Bewertungen', 'Privatpatienten']
  },
  physiotherapie: {
    id: 'physiotherapie',
    name: 'Physiotherapie',
    googleType: 'physiotherapist',
    keywords: ['Physiotherapie', 'Physiotherapeut', 'Krankengymnastik'],
    emoji: '💪',
    painPoints: ['Terminauslastung', 'Selbstzahler', 'Online-Buchung']
  },
  friseur: {
    id: 'friseur',
    name: 'Friseure',
    googleType: 'hair_salon',
    keywords: ['Friseur', 'Friseursalon', 'Hair Salon'],
    emoji: '💇',
    painPoints: ['Stammkunden', 'Social Media', 'Preisgestaltung']
  },
  kosmetik: {
    id: 'kosmetik',
    name: 'Kosmetikstudios',
    googleType: 'beauty_salon',
    keywords: ['Kosmetik', 'Kosmetikstudio', 'Beauty', 'Nagelstudio'],
    emoji: '💅',
    painPoints: ['Neukunden', 'Upselling', 'Bewertungen']
  },
  
  // Gastronomie & Einzelhandel
  restaurant: {
    id: 'restaurant',
    name: 'Restaurants',
    googleType: 'restaurant',
    keywords: ['Restaurant', 'Gaststätte', 'Lokal'],
    emoji: '🍽️',
    painPoints: ['Online-Bestellungen', 'Bewertungen', 'Stammgäste']
  },
  cafe: {
    id: 'cafe',
    name: 'Cafés',
    googleType: 'cafe',
    keywords: ['Café', 'Kaffee', 'Coffee Shop'],
    emoji: '☕',
    painPoints: ['Laufkundschaft', 'Social Media', 'Events']
  },
  
  // Automotive
  autowerkstatt: {
    id: 'autowerkstatt',
    name: 'Autowerkstätten',
    googleType: 'car_repair',
    keywords: ['Autowerkstatt', 'KFZ Werkstatt', 'Autoservice'],
    emoji: '🚗',
    painPoints: ['Stammkunden', 'Online-Termine', 'Vertrauen']
  },
  autohaendler: {
    id: 'autohaendler',
    name: 'Autohändler',
    googleType: 'car_dealer',
    keywords: ['Autohändler', 'Autohaus', 'Gebrauchtwagen'],
    emoji: '🚙',
    painPoints: ['Online-Leads', 'Finanzierung', 'Bewertungen']
  },
  
  // IT & Digital
  webdesign: {
    id: 'webdesign',
    name: 'Webdesign Agenturen',
    googleType: 'web_designer',
    keywords: ['Webdesign', 'Webentwicklung', 'Webagentur', 'Internetagentur'],
    emoji: '🌐',
    painPoints: ['Projektakquise', 'Preisverhandlung', 'Retainer']
  },
  itservice: {
    id: 'itservice',
    name: 'IT Service',
    googleType: 'computer_repair_service',
    keywords: ['IT Service', 'EDV Service', 'Computer Service'],
    emoji: '💻',
    painPoints: ['Wartungsverträge', 'Fernwartung', 'Geschäftskunden']
  },
  
  // Bildung & Training
  fahrschule: {
    id: 'fahrschule',
    name: 'Fahrschulen',
    googleType: 'driving_school',
    keywords: ['Fahrschule', 'Führerschein'],
    emoji: '🚦',
    painPoints: ['Schülergewinnung', 'Durchfallquote', 'Online-Theorie']
  },
  nachhilfe: {
    id: 'nachhilfe',
    name: 'Nachhilfe',
    googleType: 'tutoring_service',
    keywords: ['Nachhilfe', 'Lernhilfe', 'Privatlehrer'],
    emoji: '📚',
    painPoints: ['Schülerakquise', 'Online-Unterricht', 'Elternkommunikation']
  },
  
  // Sonstige
  fotograf: {
    id: 'fotograf',
    name: 'Fotografen',
    googleType: 'photographer',
    keywords: ['Fotograf', 'Fotostudio', 'Fotografie'],
    emoji: '📷',
    painPoints: ['Buchungen', 'Preisgestaltung', 'Portfolio']
  },
  umzug: {
    id: 'umzug',
    name: 'Umzugsunternehmen',
    googleType: 'moving_company',
    keywords: ['Umzug', 'Umzugsunternehmen', 'Spedition'],
    emoji: '📦',
    painPoints: ['Saisonalität', 'Bewertungen', 'Preiskalkulation']
  },
  reinigung: {
    id: 'reinigung',
    name: 'Reinigungsfirmen',
    googleType: 'cleaning_service',
    keywords: ['Reinigung', 'Gebäudereinigung', 'Putzfirma'],
    emoji: '🧹',
    painPoints: ['Gewerbekunden', 'Personal', 'Verträge']
  },
  sicherheit: {
    id: 'sicherheit',
    name: 'Sicherheitsdienste',
    googleType: 'security_service',
    keywords: ['Sicherheitsdienst', 'Security', 'Wachdienst'],
    emoji: '🔒',
    painPoints: ['Auftragsvolumen', 'Personal', 'Zuverlässigkeit']
  }
};

// =============================================
// E-MAIL SEQUENZ TEMPLATES (5 Follow-ups)
// =============================================

const SEQUENCE_TEMPLATES = {
  step1_intro: {
    delay: 0, // Sofort
    subject: (branch, lead) => `${branch.emoji} Kostenlose 20-Min Analyse für ${lead.company}`,
    body: (branch, lead, anrede) => `
<p>${anrede},</p>
<p>ich habe mir <strong>${lead.company}</strong> angeschaut und sehe großes Potenzial für mehr Kunden und Umsatz.</p>
<p>Als Spezialist für <strong>${branch.name}</strong> kenne ich die typischen Herausforderungen:</p>
<ul style="color: #666;">
  ${branch.painPoints.map(p => `<li>${p}</li>`).join('\n  ')}
</ul>
<p><strong>Mein Angebot:</strong> Eine kostenlose 20-Minuten Analyse, in der ich Ihnen zeige:</p>
<ul>
  <li>✅ Wo Sie aktuell Kunden verlieren</li>
  <li>✅ Wie Ihre Konkurrenz es besser macht</li>
  <li>✅ 3 sofort umsetzbare Tipps für mehr Anfragen</li>
</ul>
{{cta_button}}
<p>Kein Risiko, keine Verpflichtung – nur echte Insights für Ihr Geschäft.</p>
    `
  },
  
  step2_value: {
    delay: 3, // Nach 3 Tagen
    subject: (branch, lead) => `${branch.emoji} Kurze Frage zu ${lead.company}`,
    body: (branch, lead, anrede) => `
<p>${anrede},</p>
<p>ich wollte kurz nachfragen, ob Sie meine letzte Nachricht erhalten haben?</p>
<p>Viele ${branch.name} kämpfen mit:</p>
<ul>
  <li>❌ Zu wenig Anfragen trotz guter Arbeit</li>
  <li>❌ Preiskampf mit der Konkurrenz</li>
  <li>❌ Keine Zeit für Marketing</li>
</ul>
<p>Mit <strong>KI-gestützter Lead-Generierung</strong> zeige ich Ihnen konkret, wie andere ${branch.name} diese Probleme gelöst haben.</p>
{{cta_button}}
<p>Haben Sie 20 Minuten Zeit diese Woche?</p>
    `
  },
  
  step3_social_proof: {
    delay: 5, // Nach 5 Tagen (8 total)
    subject: (branch, lead) => `So gewinnen andere ${branch.name} mehr Kunden`,
    body: (branch, lead, anrede) => `
<p>${anrede},</p>
<p>letzte Woche habe ich mit einem ${branch.name.slice(0, -1)} aus München gesprochen. Sein Problem: Zu viel Arbeit, aber kaum neue Anfragen online.</p>
<p><strong>Nach unserem Gespräch:</strong></p>
<ul>
  <li>✅ 3 Quick-Wins sofort umgesetzt</li>
  <li>✅ Erste neue Anfrage nach 2 Wochen</li>
  <li>✅ Heute: 40% mehr Online-Anfragen</li>
</ul>
<p>Ich zeige Ihnen gerne, was auch für <strong>${lead.company}</strong> möglich wäre.</p>
{{cta_button}}
    `
  },
  
  step4_urgency: {
    delay: 4, // Nach 4 Tagen (12 total)
    subject: (branch, lead) => `⏰ Diese Woche noch Zeit, ${lead.company.split(' ')[0]}?`,
    body: (branch, lead, anrede) => `
<p>${anrede},</p>
<p>ich habe diese Woche noch <strong>2 freie Termine</strong> für Analyse-Gespräche.</p>
<p>In 20 Minuten erfahren Sie:</p>
<ul>
  <li>🎯 Warum Ihre Konkurrenz mehr Anfragen bekommt</li>
  <li>🎯 3 Fehler, die 90% der ${branch.name} machen</li>
  <li>🎯 Einen konkreten Aktionsplan für mehr Kunden</li>
</ul>
{{cta_button}}
<p>Komplett kostenlos. Kein Haken.</p>
    `
  },
  
  step5_breakup: {
    delay: 7, // Nach 7 Tagen (19 total)
    subject: (branch, lead) => `Letzte Nachricht von mir, ${lead.company.split(' ')[0]}`,
    body: (branch, lead, anrede) => `
<p>${anrede},</p>
<p>ich möchte Sie nicht weiter belästigen, daher ist dies meine letzte Nachricht.</p>
<p>Falls Sie doch noch Interesse an der <strong>kostenlosen Analyse</strong> haben, können Sie jederzeit einen Termin buchen:</p>
{{cta_button}}
<p>Ich wünsche Ihnen und <strong>${lead.company}</strong> weiterhin viel Erfolg!</p>
<p>Vielleicht ergibt sich ja in Zukunft eine Gelegenheit.</p>
    `
  }
};

// =============================================
// E-MAIL TEMPLATE (Dynamisch pro Branche)
// =============================================

function getEmailTemplate(branchId, lead, step = 'step1_intro') {
  const branchConfig = BRANCHES[branchId];
  if (!branchConfig) return null;

  const template = SEQUENCE_TEMPLATES[step];
  if (!template) return null;

  const anrede = lead.contactName ? `Guten Tag ${lead.contactName.split(' ')[0]}` : 'Guten Tag';
  
  const ctaButton = `
  <div style="text-align: center; margin: 30px 0;">
    <a href="{{booking_url}}" style="background: #2563eb; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
      📅 Jetzt Gratis-Termin buchen
    </a>
  </div>`;

  const bodyContent = template.body(branchConfig, lead, anrede).replace('{{cta_button}}', ctaButton);
  
  return {
    step,
    delay: template.delay,
    subject: template.subject(branchConfig, lead),
    body: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  ${bodyContent}
  
  <p>Beste Grüße,<br>
  <strong>Dominik Eisenhardt</strong><br>
  Leadquelle AI – Mehr Kunden. Ganz sicher.</p>
  
  <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
  
  <p style="font-size: 11px; color: #666;">
    <a href="{{optout_url}}" style="color: #999;">Keine weiteren E-Mails</a><br><br>
    <strong>Leadquelle Deutschland</strong><br>
    Friedrichstraße 171, 10117 Berlin<br>
    Web: leadquelle.ai | E-Mail: de@leadquelle.ai<br>
    Geschäftsführer: Dominik Eisenhardt
  </p>
</div>
    `
  };
}

// Sequenz-Steps
const SEQUENCE_STEPS = ['step1_intro', 'step2_value', 'step3_social_proof', 'step4_urgency', 'step5_breakup'];

function getNextStep(currentStep) {
  const idx = SEQUENCE_STEPS.indexOf(currentStep);
  if (idx === -1 || idx >= SEQUENCE_STEPS.length - 1) return null;
  return SEQUENCE_STEPS[idx + 1];
}

// =============================================
// SERVICE CLASS
// =============================================

class MultiLeadService {
  constructor() {
    this.apiKey = process.env.GOOGLE_PLACES_API_KEY;
    // Zoom Meeting Registrierung für Terminbuchung
    this.bookingUrl = process.env.MULTI_BOOKING_URL || 'https://us06web.zoom.us/meeting/register/X7XllnKaSKSJ9ACdf_Wvvg';
    this.fromEmail = process.env.LEADQUELLE_EMAIL || 'de@leadquelle.ai';
    this.minRating = 3.5; // Niedrigere Schwelle für breitere Zielgruppe
    this.initData();
  }

  initData() {
    // Multi-Leads Datei
    if (!fs.existsSync(MULTI_LEADS_PATH)) {
      fs.writeFileSync(MULTI_LEADS_PATH, JSON.stringify({
        leads: [],
        stats: { total: 0, contacted: 0, booked: 0, converted: 0 },
        byBranch: {}
      }, null, 2));
    }
    // Tokens Datei
    if (!fs.existsSync(MULTI_TOKENS_PATH)) {
      fs.writeFileSync(MULTI_TOKENS_PATH, JSON.stringify({ tokens: {} }, null, 2));
    }
  }

  // Alle Branchen abrufen
  getBranches() {
    return Object.values(BRANCHES);
  }

  // Branche nach ID
  getBranch(branchId) {
    return BRANCHES[branchId] || null;
  }

  // Leads suchen per Google Places
  async searchLeads(branchId, city, radius = 20000) {
    const branch = BRANCHES[branchId];
    if (!branch) throw new Error(`Branche "${branchId}" nicht gefunden`);
    if (!this.apiKey) throw new Error('GOOGLE_PLACES_API_KEY nicht konfiguriert');

    const allResults = [];

    for (const keyword of branch.keywords) {
      try {
        const response = await axios.get(`${GOOGLE_PLACES_URL}/textsearch/json`, {
          params: {
            query: `${keyword} in ${city}`,
            key: this.apiKey,
            language: 'de'
          }
        });

        if (response.data.status === 'OK') {
          allResults.push(...response.data.results);
        }
        await this.sleep(200);
      } catch (error) {
        logger.error(`Search error for ${keyword}`, { error: error.message });
      }
    }

    // Deduplizieren
    const unique = this.deduplicateByPlaceId(allResults);
    
    // Filtern nach Rating
    const qualified = unique.filter(p => !p.rating || p.rating >= this.minRating);

    logger.info(`${branch.emoji} ${city}: ${qualified.length} ${branch.name} gefunden`);

    return qualified.map(p => ({
      placeId: p.place_id,
      company: p.name,
      address: p.formatted_address,
      rating: p.rating || 0,
      reviewCount: p.user_ratings_total || 0,
      branch: branchId,
      city: city
    }));
  }

  // Place Details abrufen (inkl. Kontaktdaten)
  async getPlaceDetails(placeId) {
    try {
      const response = await axios.get(`${GOOGLE_PLACES_URL}/details/json`, {
        params: {
          place_id: placeId,
          fields: 'place_id,name,formatted_address,formatted_phone_number,website,rating,user_ratings_total,business_status',
          language: 'de',
          key: this.apiKey
        }
      });

      if (response.data.status !== 'OK') return null;

      const p = response.data.result;
      return {
        placeId: p.place_id,
        company: p.name,
        address: p.formatted_address,
        phone: p.formatted_phone_number,
        website: p.website,
        rating: p.rating || 0,
        reviewCount: p.user_ratings_total || 0,
        status: p.business_status
      };
    } catch (error) {
      return null;
    }
  }

  // E-Mail von Website scrapen
  async scrapeEmail(websiteUrl) {
    if (!websiteUrl) return null;
    try {
      const response = await axios.get(websiteUrl, {
        timeout: 5000,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LeadBot/1.0)' }
      });
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const emails = response.data.match(emailRegex) || [];
      const validEmails = emails.filter(e => 
        !e.includes('example') && !e.includes('domain') && 
        !e.includes('sentry') && !e.includes('.png') && !e.includes('.jpg')
      );
      return validEmails[0] || null;
    } catch {
      return null;
    }
  }

  // Lead speichern
  saveLead(lead) {
    const data = JSON.parse(fs.readFileSync(MULTI_LEADS_PATH, 'utf-8'));
    
    // Duplikat-Check
    if (data.leads.find(l => l.placeId === lead.placeId)) {
      return { success: false, reason: 'duplicate' };
    }

    const newLead = {
      id: crypto.randomUUID(),
      ...lead,
      status: 'new',
      createdAt: new Date().toISOString(),
      contactedAt: null,
      bookedAt: null
    };

    data.leads.push(newLead);
    data.stats.total++;
    
    // Stats pro Branche
    if (!data.byBranch[lead.branch]) {
      data.byBranch[lead.branch] = { total: 0, contacted: 0, booked: 0 };
    }
    data.byBranch[lead.branch].total++;

    fs.writeFileSync(MULTI_LEADS_PATH, JSON.stringify(data, null, 2));
    return { success: true, lead: newLead };
  }

  // Token generieren für Tracking
  generateToken(leadId, action) {
    const token = crypto.randomBytes(16).toString('hex');
    const data = JSON.parse(fs.readFileSync(MULTI_TOKENS_PATH, 'utf-8'));
    data.tokens[token] = { leadId, action, createdAt: new Date().toISOString() };
    fs.writeFileSync(MULTI_TOKENS_PATH, JSON.stringify(data, null, 2));
    return token;
  }

  // E-Mail senden
  async sendOutreachEmail(leadId) {
    const data = JSON.parse(fs.readFileSync(MULTI_LEADS_PATH, 'utf-8'));
    const lead = data.leads.find(l => l.id === leadId);
    
    if (!lead) throw new Error('Lead nicht gefunden');
    if (!lead.email) throw new Error('Keine E-Mail-Adresse');
    if (lead.status === 'contacted') throw new Error('Bereits kontaktiert');

    const template = getEmailTemplate(lead.branch, lead);
    if (!template) throw new Error('Template nicht gefunden');

    // Tokens generieren
    const bookingToken = this.generateToken(leadId, 'booking');
    const optoutToken = this.generateToken(leadId, 'optout');

    const baseUrl = process.env.PUBLIC_URL || 'http://localhost:3001';
    const body = template.body
      .replace('{{booking_url}}', `${baseUrl}/api/multi-leads/track/${bookingToken}?redirect=${encodeURIComponent(this.bookingUrl)}`)
      .replace('{{optout_url}}', `${baseUrl}/api/multi-leads/optout/${optoutToken}`);

    // E-Mail senden (über Leadquelle Account wenn konfiguriert)
    await emailService.sendEmail({
      to: lead.email,
      subject: template.subject,
      body: body,
      from: this.fromEmail // de@leadquelle.ai
    });

    // Status aktualisieren
    lead.status = 'contacted';
    lead.contactedAt = new Date().toISOString();
    data.stats.contacted++;
    data.byBranch[lead.branch].contacted++;
    
    fs.writeFileSync(MULTI_LEADS_PATH, JSON.stringify(data, null, 2));

    logger.info(`📧 Multi-Lead E-Mail gesendet: ${lead.company} (${lead.branch})`);
    return { success: true, lead };
  }

  // Sequenz E-Mail senden (für Follow-ups)
  async sendSequenceEmail(leadId, step) {
    const data = JSON.parse(fs.readFileSync(MULTI_LEADS_PATH, 'utf-8'));
    const lead = data.leads.find(l => l.id === leadId);
    
    if (!lead) throw new Error('Lead nicht gefunden');
    if (!lead.email) throw new Error('Keine E-Mail-Adresse');
    if (lead.status === 'booked' || lead.status === 'opted_out') return { skipped: true, reason: lead.status };

    const template = getEmailTemplate(lead.branch, lead, step);
    if (!template) throw new Error('Template nicht gefunden');

    const bookingToken = this.generateToken(leadId, 'booking');
    const optoutToken = this.generateToken(leadId, 'optout');

    const baseUrl = process.env.PUBLIC_URL || 'http://localhost:3001';
    const body = template.body
      .replace('{{booking_url}}', `${baseUrl}/api/multi-leads/track/${bookingToken}?redirect=${encodeURIComponent(this.bookingUrl)}`)
      .replace('{{optout_url}}', `${baseUrl}/api/multi-leads/optout/${optoutToken}`);

    await emailService.sendEmail({
      to: lead.email,
      subject: template.subject,
      body: body,
      from: this.fromEmail
    });

    // Sequenz-Status aktualisieren
    lead.currentStep = step;
    lead.lastEmailAt = new Date().toISOString();
    lead.emailCount = (lead.emailCount || 0) + 1;
    
    fs.writeFileSync(MULTI_LEADS_PATH, JSON.stringify(data, null, 2));

    logger.info(`📧 Sequenz ${step}: ${lead.company} (${lead.branch})`);
    return { success: true, step, lead };
  }

  // Follow-ups verarbeiten (für Cron-Job)
  async processSequences() {
    const data = JSON.parse(fs.readFileSync(MULTI_LEADS_PATH, 'utf-8'));
    const now = new Date();
    let processed = 0;

    for (const lead of data.leads) {
      // Skip wenn gebucht, opted-out oder keine E-Mail
      if (!lead.email || lead.status === 'booked' || lead.status === 'opted_out') continue;
      
      // Skip wenn noch nie kontaktiert
      if (!lead.lastEmailAt) continue;

      const lastEmail = new Date(lead.lastEmailAt);
      const daysSinceLastEmail = (now - lastEmail) / (1000 * 60 * 60 * 24);
      
      // Nächsten Step ermitteln
      const currentStep = lead.currentStep || 'step1_intro';
      const nextStep = getNextStep(currentStep);
      
      if (!nextStep) continue; // Sequenz beendet

      // Delay für nächsten Step prüfen
      const nextTemplate = SEQUENCE_TEMPLATES[nextStep];
      if (daysSinceLastEmail >= nextTemplate.delay) {
        try {
          await this.sendSequenceEmail(lead.id, nextStep);
          processed++;
          await this.sleep(2000); // Rate limiting
        } catch (error) {
          logger.error(`Sequenz-Fehler für ${lead.company}`, { error: error.message });
        }
      }
    }

    return { processed };
  }

  // Tracking verarbeiten
  trackAction(token) {
    const tokensData = JSON.parse(fs.readFileSync(MULTI_TOKENS_PATH, 'utf-8'));
    const tokenInfo = tokensData.tokens[token];
    
    if (!tokenInfo) return null;

    const data = JSON.parse(fs.readFileSync(MULTI_LEADS_PATH, 'utf-8'));
    const lead = data.leads.find(l => l.id === tokenInfo.leadId);
    
    if (!lead) return null;

    if (tokenInfo.action === 'booking') {
      lead.status = 'booked';
      lead.bookedAt = new Date().toISOString();
      data.stats.booked++;
      data.byBranch[lead.branch].booked++;
      
      logger.info(`🎯 BOOKING: ${lead.company} (${lead.branch})`);
    }

    fs.writeFileSync(MULTI_LEADS_PATH, JSON.stringify(data, null, 2));
    return { action: tokenInfo.action, lead };
  }

  // Opt-Out
  optOut(token) {
    const tokensData = JSON.parse(fs.readFileSync(MULTI_TOKENS_PATH, 'utf-8'));
    const tokenInfo = tokensData.tokens[token];
    
    if (!tokenInfo) return false;

    const data = JSON.parse(fs.readFileSync(MULTI_LEADS_PATH, 'utf-8'));
    const lead = data.leads.find(l => l.id === tokenInfo.leadId);
    
    if (lead) {
      lead.status = 'opted_out';
      lead.optedOutAt = new Date().toISOString();
      fs.writeFileSync(MULTI_LEADS_PATH, JSON.stringify(data, null, 2));
      logger.info(`🚫 Opt-Out: ${lead.company}`);
    }

    return true;
  }

  // Stats abrufen
  getStats() {
    const data = JSON.parse(fs.readFileSync(MULTI_LEADS_PATH, 'utf-8'));
    return {
      overall: data.stats,
      byBranch: data.byBranch,
      recentLeads: data.leads.slice(-10).reverse()
    };
  }

  // Alle Leads einer Branche
  getLeadsByBranch(branchId, status = null) {
    const data = JSON.parse(fs.readFileSync(MULTI_LEADS_PATH, 'utf-8'));
    let leads = data.leads.filter(l => l.branch === branchId);
    if (status) {
      leads = leads.filter(l => l.status === status);
    }
    return leads;
  }

  // =============================================
  // AUTOMATISCHE LEAD-GENERIERUNG
  // =============================================

  // Städte für Lead-Suche (Top 20 deutsche Städte)
  getCities() {
    return [
      'Berlin', 'Hamburg', 'München', 'Köln', 'Frankfurt am Main',
      'Stuttgart', 'Düsseldorf', 'Leipzig', 'Dortmund', 'Essen',
      'Bremen', 'Dresden', 'Hannover', 'Nürnberg', 'Duisburg',
      'Bochum', 'Wuppertal', 'Bielefeld', 'Bonn', 'Münster'
    ];
  }

  // Komplette Lead-Generierung (Suchen + Importieren + E-Mail senden)
  async runLeadGeneration(options = {}) {
    const { 
      branch = null, // null = random branch
      city = null,   // null = random city
      maxLeads = 5,  // Max Leads pro Durchlauf
      sendEmail = true 
    } = options;

    // Zufällige Branche wenn nicht angegeben
    const branchIds = Object.keys(BRANCHES);
    const selectedBranch = branch || branchIds[Math.floor(Math.random() * branchIds.length)];
    const branchConfig = BRANCHES[selectedBranch];

    // Zufällige Stadt wenn nicht angegeben
    const cities = this.getCities();
    const selectedCity = city || cities[Math.floor(Math.random() * cities.length)];

    logger.info(`🔍 Leadquelle: Suche ${branchConfig.name} in ${selectedCity}...`);

    const results = { searched: 0, imported: 0, emailed: 0, errors: [] };

    try {
      // 1. Leads suchen
      const searchResults = await this.searchLeads(selectedBranch, selectedCity);
      results.searched = searchResults.length;

      // 2. Top Leads importieren (mit E-Mail)
      let imported = 0;
      for (const item of searchResults) {
        if (imported >= maxLeads) break;

        try {
          // Details abrufen
          const details = await this.getPlaceDetails(item.placeId);
          if (!details || details.status !== 'OPERATIONAL') continue;

          // E-Mail scrapen
          let email = null;
          if (details.website) {
            email = await this.scrapeEmail(details.website);
          }

          // Nur mit E-Mail importieren
          if (!email) continue;

          // Lead speichern
          const saveResult = this.saveLead({
            ...details,
            branch: selectedBranch,
            city: selectedCity,
            email
          });

          if (!saveResult.success) continue;

          imported++;
          results.imported++;

          // 3. Erste E-Mail senden
          if (sendEmail) {
            try {
              await this.sendSequenceEmail(saveResult.lead.id, 'step1_intro');
              results.emailed++;
              logger.info(`📧 Leadquelle: ${details.company} angeschrieben`);
            } catch (emailError) {
              results.errors.push({ company: details.company, error: emailError.message });
            }
          }

          await this.sleep(1000); // Rate limiting

        } catch (error) {
          results.errors.push({ placeId: item.placeId, error: error.message });
        }
      }

      logger.info(`✅ Leadquelle: ${results.imported} Leads importiert, ${results.emailed} E-Mails gesendet`);

    } catch (error) {
      logger.error('Leadquelle Generation Fehler', { error: error.message });
      results.errors.push({ error: error.message });
    }

    return {
      branch: selectedBranch,
      branchName: branchConfig.name,
      city: selectedCity,
      ...results
    };
  }

  // Helpers
  deduplicateByPlaceId(results) {
    const seen = new Set();
    return results.filter(p => {
      if (seen.has(p.place_id)) return false;
      seen.add(p.place_id);
      return true;
    });
  }

  sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }
}

export const multiLeadService = new MultiLeadService();
export { BRANCHES };
export default multiLeadService;
