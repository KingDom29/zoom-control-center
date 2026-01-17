/**
 * Unified Contact Service
 * Eine Datenbank für ALLE Kontakte aus allen Quellen
 * 
 * Stages: lead → prospect → meeting_scheduled → meeting_done → customer → active → churned
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import logger from '../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONTACTS_DB_PATH = path.join(__dirname, '../../data/unified-contacts.json');
const INTERACTIONS_DB_PATH = path.join(__dirname, '../../data/unified-interactions.json');

// Pipeline Stages
export const STAGES = {
  LEAD: 'lead',                      // Neu gefunden (Google, Import)
  PROSPECT: 'prospect',              // Erste E-Mail gesendet
  CONTACTED: 'contacted',            // Hat reagiert (Click, Antwort)
  MEETING_SCHEDULED: 'meeting_scheduled',  // Meeting geplant
  MEETING_DONE: 'meeting_done',      // Meeting durchgeführt
  PROPOSAL_SENT: 'proposal_sent',    // Angebot gesendet
  NEGOTIATION: 'negotiation',        // In Verhandlung
  CUSTOMER: 'customer',              // Abgeschlossen
  ACTIVE: 'active',                  // Aktiver Kunde
  CHURNED: 'churned',                // Abgewandert
  LOST: 'lost'                       // Kein Interesse
};

// Quellen
export const SOURCES = {
  GOOGLE_PLACES: 'google_places',
  EXCEL_IMPORT: 'excel_import',
  MANUAL: 'manual',
  WEBSITE: 'website',
  REFERRAL: 'referral',
  ZENDESK: 'zendesk',
  LEADQUELLE: 'leadquelle',
  MAKLERPLAN_CAMPAIGN: 'maklerplan_campaign',
  MAKLERPLAN_OUTREACH: 'maklerplan_outreach'
};

// Kommunikations-Kanäle
export const CHANNELS = {
  EMAIL: 'email',
  SMS: 'sms',
  PHONE: 'phone',
  WHATSAPP: 'whatsapp',
  ZOOM_MEETING: 'zoom_meeting',
  ZENDESK_TICKET: 'zendesk_ticket'
};

class UnifiedContactService {
  
  constructor() {
    this.contacts = this.loadContacts();
    this.interactions = this.loadInteractions();
  }

  loadContacts() {
    try {
      if (fs.existsSync(CONTACTS_DB_PATH)) {
        return JSON.parse(fs.readFileSync(CONTACTS_DB_PATH, 'utf8'));
      }
    } catch (error) {
      logger.error('Unified Contacts laden Fehler', { error: error.message });
    }
    return { contacts: {}, stats: { total: 0, byStage: {}, bySource: {}, byBrand: {} } };
  }

  loadInteractions() {
    try {
      if (fs.existsSync(INTERACTIONS_DB_PATH)) {
        return JSON.parse(fs.readFileSync(INTERACTIONS_DB_PATH, 'utf8'));
      }
    } catch (error) {
      logger.error('Interactions laden Fehler', { error: error.message });
    }
    return {};
  }

  saveContacts() {
    try {
      this.updateStats();
      fs.writeFileSync(CONTACTS_DB_PATH, JSON.stringify(this.contacts, null, 2));
    } catch (error) {
      logger.error('Contacts speichern Fehler', { error: error.message });
    }
  }

  saveInteractions() {
    try {
      fs.writeFileSync(INTERACTIONS_DB_PATH, JSON.stringify(this.interactions, null, 2));
    } catch (error) {
      logger.error('Interactions speichern Fehler', { error: error.message });
    }
  }

  updateStats() {
    const stats = { total: 0, byStage: {}, bySource: {}, byBrand: {} };
    
    for (const contact of Object.values(this.contacts.contacts || {})) {
      stats.total++;
      stats.byStage[contact.stage] = (stats.byStage[contact.stage] || 0) + 1;
      stats.bySource[contact.source] = (stats.bySource[contact.source] || 0) + 1;
      stats.byBrand[contact.activeBrand] = (stats.byBrand[contact.activeBrand] || 0) + 1;
    }
    
    this.contacts.stats = stats;
  }

  // ============================================
  // CONTACT CRUD
  // ============================================

  generateId() {
    return `contact_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Kontakt erstellen oder aktualisieren (Upsert by Email)
   */
  upsertContact(data) {
    const email = data.email?.toLowerCase().trim();
    if (!email) throw new Error('E-Mail ist erforderlich');

    // Existierenden Kontakt finden
    let existingId = null;
    for (const [id, contact] of Object.entries(this.contacts.contacts || {})) {
      if (contact.email === email) {
        existingId = id;
        break;
      }
    }

    const now = new Date().toISOString();

    if (existingId) {
      // Update
      const existing = this.contacts.contacts[existingId];
      this.contacts.contacts[existingId] = {
        ...existing,
        ...data,
        email, // Immer lowercase
        updatedAt: now,
        // Merge Tags
        tags: [...new Set([...(existing.tags || []), ...(data.tags || [])])],
        // Alte Quelle behalten, neue hinzufügen
        sources: [...new Set([...(existing.sources || [existing.source]), data.source].filter(Boolean))]
      };
      
      this.saveContacts();
      logger.info('Contact updated', { id: existingId, email });
      return this.contacts.contacts[existingId];
    } else {
      // Create
      const id = this.generateId();
      this.contacts.contacts[id] = {
        id,
        email,
        firstName: data.firstName || '',
        lastName: data.lastName || '',
        company: data.company || '',
        phone: data.phone || '',
        mobile: data.mobile || '',
        
        // Pipeline
        stage: data.stage || STAGES.LEAD,
        
        // Quelle & Brand
        source: data.source || SOURCES.MANUAL,
        sources: [data.source || SOURCES.MANUAL],
        activeBrand: data.brand || 'maklerplan',
        
        // Branche (für Leadquelle)
        branch: data.branch || null,
        
        // Adresse
        address: data.address || '',
        city: data.city || '',
        zip: data.zip || '',
        country: data.country || 'Deutschland',
        
        // Business Info
        website: data.website || '',
        rating: data.rating || null,
        reviewCount: data.reviewCount || null,
        
        // Tags
        tags: data.tags || [],
        
        // Kommunikations-Präferenzen
        preferences: {
          email: true,
          sms: data.allowSms || false,
          phone: data.allowPhone || true,
          whatsapp: data.allowWhatsapp || false
        },
        
        // Opt-Out Status
        optedOut: false,
        optedOutAt: null,
        optedOutReason: null,
        
        // Zuordnung
        assignedTo: data.assignedTo || null,
        
        // Timestamps
        createdAt: now,
        updatedAt: now,
        lastContactAt: null,
        lastInteractionAt: null,
        
        // Zoom
        zoomMeetings: [],
        lastMeetingAt: null,
        
        // Zendesk
        zendeskTickets: [],
        lastTicketAt: null,
        
        // E-Mail Tracking
        emailsSent: 0,
        emailsOpened: 0,
        emailsClicked: 0,
        lastEmailAt: null,
        
        // Sequenz-Status
        activeSequence: null,
        sequenceStep: 0,
        
        // Custom Fields
        customFields: data.customFields || {},
        
        // Notes
        notes: data.notes || ''
      };

      this.saveContacts();
      this.interactions[id] = [];
      this.saveInteractions();
      
      logger.info('Contact created', { id, email, source: data.source });
      return this.contacts.contacts[id];
    }
  }

  /**
   * Kontakt abrufen
   */
  getContact(id) {
    return this.contacts.contacts[id] || null;
  }

  /**
   * Kontakt nach E-Mail suchen
   */
  getContactByEmail(email) {
    const normalizedEmail = email?.toLowerCase().trim();
    for (const contact of Object.values(this.contacts.contacts || {})) {
      if (contact.email === normalizedEmail) {
        return contact;
      }
    }
    return null;
  }

  /**
   * Kontakte filtern
   */
  findContacts(filters = {}) {
    let results = Object.values(this.contacts.contacts || {});

    if (filters.stage) {
      results = results.filter(c => c.stage === filters.stage);
    }
    if (filters.source) {
      results = results.filter(c => c.source === filters.source || c.sources?.includes(filters.source));
    }
    if (filters.brand) {
      results = results.filter(c => c.activeBrand === filters.brand);
    }
    if (filters.branch) {
      results = results.filter(c => c.branch === filters.branch);
    }
    if (filters.tag) {
      results = results.filter(c => c.tags?.includes(filters.tag));
    }
    if (filters.assignedTo) {
      results = results.filter(c => c.assignedTo === filters.assignedTo);
    }
    if (filters.hasPhone) {
      results = results.filter(c => c.phone || c.mobile);
    }
    if (filters.optedOut !== undefined) {
      results = results.filter(c => c.optedOut === filters.optedOut);
    }
    if (filters.search) {
      const search = filters.search.toLowerCase();
      results = results.filter(c => 
        c.email?.includes(search) ||
        c.firstName?.toLowerCase().includes(search) ||
        c.lastName?.toLowerCase().includes(search) ||
        c.company?.toLowerCase().includes(search)
      );
    }

    // Sortieren
    if (filters.sortBy) {
      results.sort((a, b) => {
        const aVal = a[filters.sortBy] || '';
        const bVal = b[filters.sortBy] || '';
        return filters.sortOrder === 'desc' ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
      });
    }

    // Pagination
    const limit = filters.limit || 100;
    const offset = filters.offset || 0;
    
    return {
      contacts: results.slice(offset, offset + limit),
      total: results.length,
      limit,
      offset
    };
  }

  // ============================================
  // STAGE MANAGEMENT
  // ============================================

  /**
   * Stage ändern
   */
  updateStage(contactId, newStage, reason = null) {
    const contact = this.contacts.contacts[contactId];
    if (!contact) throw new Error('Contact not found');

    const oldStage = contact.stage;
    contact.stage = newStage;
    contact.updatedAt = new Date().toISOString();

    // Interaction loggen
    this.addInteraction(contactId, {
      type: 'stage_change',
      channel: 'system',
      data: { from: oldStage, to: newStage, reason }
    });

    this.saveContacts();
    logger.info('Stage updated', { contactId, from: oldStage, to: newStage });
    
    return contact;
  }

  // ============================================
  // INTERACTION TRACKING
  // ============================================

  /**
   * Interaktion hinzufügen
   */
  addInteraction(contactId, interaction) {
    if (!this.interactions[contactId]) {
      this.interactions[contactId] = [];
    }

    const record = {
      id: `int_${crypto.randomBytes(6).toString('hex')}`,
      timestamp: new Date().toISOString(),
      type: interaction.type, // email_sent, email_opened, email_clicked, sms_sent, phone_call, meeting, zendesk_ticket, stage_change
      channel: interaction.channel, // email, sms, phone, whatsapp, zoom_meeting, zendesk
      brand: interaction.brand || 'maklerplan',
      direction: interaction.direction || 'outbound', // inbound, outbound
      data: interaction.data || {},
      metadata: interaction.metadata || {}
    };

    this.interactions[contactId].unshift(record);
    
    // Contact updaten
    const contact = this.contacts.contacts[contactId];
    if (contact) {
      contact.lastInteractionAt = record.timestamp;
      
      // Spezifische Updates
      if (interaction.type === 'email_sent') {
        contact.emailsSent = (contact.emailsSent || 0) + 1;
        contact.lastEmailAt = record.timestamp;
      }
      if (interaction.type === 'email_opened') {
        contact.emailsOpened = (contact.emailsOpened || 0) + 1;
      }
      if (interaction.type === 'email_clicked') {
        contact.emailsClicked = (contact.emailsClicked || 0) + 1;
      }
      if (interaction.type === 'meeting') {
        contact.zoomMeetings.push(interaction.data.meetingId);
        contact.lastMeetingAt = record.timestamp;
      }
      if (interaction.type === 'phone_call') {
        contact.lastContactAt = record.timestamp;
      }
      
      this.saveContacts();
    }

    this.saveInteractions();
    return record;
  }

  /**
   * Interaktionen abrufen
   */
  getInteractions(contactId, limit = 50) {
    return (this.interactions[contactId] || []).slice(0, limit);
  }

  // ============================================
  // OPT-OUT MANAGEMENT
  // ============================================

  optOut(contactId, reason = null) {
    const contact = this.contacts.contacts[contactId];
    if (!contact) throw new Error('Contact not found');

    contact.optedOut = true;
    contact.optedOutAt = new Date().toISOString();
    contact.optedOutReason = reason;
    contact.activeSequence = null;

    this.addInteraction(contactId, {
      type: 'opt_out',
      channel: 'system',
      data: { reason }
    });

    this.saveContacts();
    logger.info('Contact opted out', { contactId, reason });
    
    return contact;
  }

  // ============================================
  // STATISTICS
  // ============================================

  getStats() {
    this.updateStats();
    return this.contacts.stats;
  }

  getPipelineStats() {
    const pipeline = {};
    
    for (const stage of Object.values(STAGES)) {
      const contacts = Object.values(this.contacts.contacts || {}).filter(c => c.stage === stage);
      pipeline[stage] = {
        count: contacts.length,
        value: 0, // Hier könnte Deal-Value berechnet werden
        contacts: contacts.slice(0, 5).map(c => ({ id: c.id, email: c.email, company: c.company }))
      };
    }
    
    return pipeline;
  }

  // ============================================
  // MIGRATION
  // ============================================

  /**
   * Migriert Kontakte aus altem System
   */
  async migrateFromLegacy(source, contacts) {
    let migrated = 0;
    let skipped = 0;

    for (const oldContact of contacts) {
      try {
        this.upsertContact({
          email: oldContact.email || oldContact.Email || oldContact.EMAIL,
          firstName: oldContact.firstName || oldContact.vorname || oldContact.Vorname,
          lastName: oldContact.lastName || oldContact.name || oldContact.Name || oldContact.nachname,
          company: oldContact.company || oldContact.firma || oldContact.Firma,
          phone: oldContact.phone || oldContact.telefon || oldContact.Telefon,
          source,
          brand: source === 'leadquelle' ? 'leadquelle' : 'maklerplan',
          branch: oldContact.branch,
          city: oldContact.city || oldContact.ort || oldContact.district,
          rating: oldContact.rating,
          reviewCount: oldContact.reviewCount || oldContact.reviews,
          stage: this.mapLegacyStatus(oldContact.status || oldContact.stage),
          tags: oldContact.tags || []
        });
        migrated++;
      } catch (error) {
        skipped++;
        logger.warn('Migration skipped', { email: oldContact.email, error: error.message });
      }
    }

    logger.info('Migration completed', { source, migrated, skipped });
    return { migrated, skipped };
  }

  mapLegacyStatus(status) {
    const mapping = {
      'new': STAGES.LEAD,
      'contacted': STAGES.PROSPECT,
      'interested': STAGES.CONTACTED,
      'meeting_scheduled': STAGES.MEETING_SCHEDULED,
      'meeting_done': STAGES.MEETING_DONE,
      'won': STAGES.CUSTOMER,
      'lost': STAGES.LOST,
      'opted_out': STAGES.LOST
    };
    return mapping[status] || STAGES.LEAD;
  }
}

export const unifiedContactService = new UnifiedContactService();
