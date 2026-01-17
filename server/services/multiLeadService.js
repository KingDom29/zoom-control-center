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
// E-MAIL TEMPLATE (Dynamisch pro Branche)
// =============================================

function getEmailTemplate(branch, lead) {
  const branchConfig = BRANCHES[branch];
  if (!branchConfig) return null;

  const anrede = lead.contactName ? `Guten Tag ${lead.contactName.split(' ')[0]}` : 'Guten Tag';
  
  return {
    subject: `${branchConfig.emoji} Kostenlose 20-Min Analyse für ${lead.company}`,
    body: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <p>${anrede},</p>
  
  <p>ich habe mir <strong>${lead.company}</strong> angeschaut und sehe großes Potenzial für mehr Kunden und Umsatz.</p>
  
  <p>Als Spezialist für <strong>${branchConfig.name}</strong> kenne ich die typischen Herausforderungen:</p>
  
  <ul style="color: #666;">
    ${branchConfig.painPoints.map(p => `<li>${p}</li>`).join('\n    ')}
  </ul>
  
  <p><strong>Mein Angebot:</strong> Eine kostenlose 20-Minuten Analyse, in der ich Ihnen zeige:</p>
  
  <ul>
    <li>✅ Wo Sie aktuell Kunden verlieren</li>
    <li>✅ Wie Ihre Konkurrenz es besser macht</li>
    <li>✅ 3 sofort umsetzbare Tipps für mehr Anfragen</li>
  </ul>
  
  <div style="text-align: center; margin: 30px 0;">
    <a href="{{booking_url}}" style="background: #2563eb; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
      📅 Jetzt Gratis-Termin buchen
    </a>
  </div>
  
  <p>Kein Risiko, keine Verpflichtung – nur echte Insights für Ihr Geschäft.</p>
  
  <p>Beste Grüße,<br>
  <strong>Dominik Eisenhardt</strong><br>
  Leadquelle Deutschland</p>
  
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

// =============================================
// SERVICE CLASS
// =============================================

class MultiLeadService {
  constructor() {
    this.apiKey = process.env.GOOGLE_PLACES_API_KEY;
    // Zoom Scheduler für Terminbuchung
    this.bookingUrl = process.env.MULTI_BOOKING_URL || 'https://scheduler.zoom.us/leadquelle/analyse';
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
