/**
 * Lead Database Service
 * JSON-basierte Datenbank für Makler-Leads
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '../data/leads.json');
const DATA_DIR = path.join(__dirname, '../data');

// Lead Status Enum
export const LeadStatus = {
  NEW: 'new',
  CONTACTED: 'contacted',
  MEETING_SCHEDULED: 'meeting_scheduled',
  MEETING_DONE: 'meeting_done',
  NEGOTIATING: 'negotiating',
  WON: 'won',
  LOST: 'lost'
};

// Lead Priority Enum
export const LeadPriority = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  HOT: 'hot'
};

class LeadDatabase {
  constructor() {
    this.ensureDataDir();
    this.leads = this.loadDatabase();
  }

  ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DB_PATH)) {
      fs.writeFileSync(DB_PATH, JSON.stringify({ leads: [], metadata: { created: new Date().toISOString(), version: '1.0' } }, null, 2));
    }
  }

  loadDatabase() {
    try {
      const data = fs.readFileSync(DB_PATH, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      logger.error('Error loading lead database', { error: error.message });
      return { leads: [], metadata: { created: new Date().toISOString(), version: '1.0' } };
    }
  }

  saveDatabase() {
    try {
      fs.writeFileSync(DB_PATH, JSON.stringify(this.leads, null, 2));
    } catch (error) {
      logger.error('Error saving lead database', { error: error.message });
      throw error;
    }
  }

  generateId() {
    return crypto.randomUUID();
  }

  // CREATE - Neuen Lead erstellen
  createLead(leadData) {
    const lead = {
      id: this.generateId(),
      // Google Places Daten
      placeId: leadData.placeId || null,
      name: leadData.name,
      company: leadData.company || leadData.name,
      address: leadData.address || '',
      phone: leadData.phone || '',
      email: leadData.email || '',
      website: leadData.website || '',
      
      // Google Places Extras
      rating: leadData.rating || null,
      reviewCount: leadData.reviewCount || 0,
      openingHours: leadData.openingHours || [],
      location: leadData.location || null, // { lat, lng }
      
      // Lead Management
      status: leadData.status || LeadStatus.NEW,
      priority: leadData.priority || LeadPriority.MEDIUM,
      tags: leadData.tags || [],
      source: leadData.source || 'google_places',
      
      // Kontakt-Info
      contactPerson: leadData.contactPerson || '',
      contactEmail: leadData.contactEmail || '',
      contactPhone: leadData.contactPhone || '',
      
      // Notizen & History
      notes: leadData.notes || '',
      activities: [],
      
      // Meetings
      meetings: [],
      nextMeetingDate: null,
      
      // Timestamps
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastContactedAt: null
    };

    this.leads.leads.push(lead);
    this.saveDatabase();
    return lead;
  }

  // READ - Alle Leads abrufen
  getAllLeads(filters = {}) {
    let results = [...this.leads.leads];

    // Filter by status
    if (filters.status) {
      results = results.filter(l => l.status === filters.status);
    }

    // Filter by priority
    if (filters.priority) {
      results = results.filter(l => l.priority === filters.priority);
    }

    // Filter by tag
    if (filters.tag) {
      results = results.filter(l => l.tags.includes(filters.tag));
    }

    // Filter by search term
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      results = results.filter(l => 
        l.name.toLowerCase().includes(searchLower) ||
        l.company.toLowerCase().includes(searchLower) ||
        l.address.toLowerCase().includes(searchLower) ||
        l.email.toLowerCase().includes(searchLower)
      );
    }

    // Sort
    if (filters.sortBy) {
      const sortField = filters.sortBy;
      const sortOrder = filters.sortOrder === 'desc' ? -1 : 1;
      results.sort((a, b) => {
        if (a[sortField] < b[sortField]) return -1 * sortOrder;
        if (a[sortField] > b[sortField]) return 1 * sortOrder;
        return 0;
      });
    } else {
      // Default: neueste zuerst
      results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    return results;
  }

  // READ - Einzelnen Lead abrufen
  getLeadById(id) {
    return this.leads.leads.find(l => l.id === id);
  }

  // READ - Lead by Place ID (für Duplikat-Check)
  getLeadByPlaceId(placeId) {
    return this.leads.leads.find(l => l.placeId === placeId);
  }

  // UPDATE - Lead aktualisieren
  updateLead(id, updates) {
    const index = this.leads.leads.findIndex(l => l.id === id);
    if (index === -1) return null;

    this.leads.leads[index] = {
      ...this.leads.leads[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };

    this.saveDatabase();
    return this.leads.leads[index];
  }

  // UPDATE - Status ändern
  updateStatus(id, status) {
    const lead = this.getLeadById(id);
    if (!lead) return null;

    // Activity hinzufügen
    const activity = {
      id: this.generateId(),
      type: 'status_change',
      from: lead.status,
      to: status,
      timestamp: new Date().toISOString()
    };

    return this.updateLead(id, {
      status,
      activities: [...lead.activities, activity]
    });
  }

  // UPDATE - Notiz hinzufügen
  addNote(id, note) {
    const lead = this.getLeadById(id);
    if (!lead) return null;

    const activity = {
      id: this.generateId(),
      type: 'note',
      content: note,
      timestamp: new Date().toISOString()
    };

    return this.updateLead(id, {
      notes: lead.notes ? `${lead.notes}\n\n${note}` : note,
      activities: [...lead.activities, activity]
    });
  }

  // UPDATE - Meeting hinzufügen
  addMeeting(id, meetingData) {
    const lead = this.getLeadById(id);
    if (!lead) return null;

    const meeting = {
      id: this.generateId(),
      zoomMeetingId: meetingData.zoomMeetingId,
      topic: meetingData.topic,
      type: meetingData.type || 'erstgespraech',
      scheduledAt: meetingData.scheduledAt,
      duration: meetingData.duration || 30,
      joinUrl: meetingData.joinUrl,
      status: 'scheduled',
      notes: '',
      createdAt: new Date().toISOString()
    };

    const activity = {
      id: this.generateId(),
      type: 'meeting_scheduled',
      meetingId: meeting.id,
      topic: meeting.topic,
      timestamp: new Date().toISOString()
    };

    return this.updateLead(id, {
      meetings: [...lead.meetings, meeting],
      nextMeetingDate: meetingData.scheduledAt,
      status: LeadStatus.MEETING_SCHEDULED,
      activities: [...lead.activities, activity]
    });
  }

  // DELETE - Lead löschen
  deleteLead(id) {
    const index = this.leads.leads.findIndex(l => l.id === id);
    if (index === -1) return false;

    this.leads.leads.splice(index, 1);
    this.saveDatabase();
    return true;
  }

  // BULK - Mehrere Leads aus Google Places importieren
  bulkImportFromPlaces(placesResults) {
    const imported = [];
    const skipped = [];

    for (const place of placesResults) {
      // Check for duplicates
      if (place.place_id && this.getLeadByPlaceId(place.place_id)) {
        skipped.push({ placeId: place.place_id, name: place.name, reason: 'duplicate' });
        continue;
      }

      const lead = this.createLead({
        placeId: place.place_id,
        name: place.name,
        company: place.name,
        address: place.formatted_address || place.vicinity || '',
        phone: place.formatted_phone_number || place.international_phone_number || '',
        website: place.website || '',
        rating: place.rating,
        reviewCount: place.user_ratings_total || 0,
        openingHours: place.opening_hours?.weekday_text || [],
        location: place.geometry?.location || null,
        source: 'google_places'
      });

      imported.push(lead);
    }

    return { imported, skipped };
  }

  // STATS - Statistiken
  getStats() {
    const leads = this.leads.leads;
    
    const statusCounts = {};
    Object.values(LeadStatus).forEach(status => {
      statusCounts[status] = leads.filter(l => l.status === status).length;
    });

    const priorityCounts = {};
    Object.values(LeadPriority).forEach(priority => {
      priorityCounts[priority] = leads.filter(l => l.priority === priority).length;
    });

    const thisWeek = new Date();
    thisWeek.setDate(thisWeek.getDate() - 7);
    
    return {
      total: leads.length,
      byStatus: statusCounts,
      byPriority: priorityCounts,
      newThisWeek: leads.filter(l => new Date(l.createdAt) > thisWeek).length,
      withMeetings: leads.filter(l => l.meetings.length > 0).length,
      avgRating: leads.filter(l => l.rating).reduce((acc, l) => acc + l.rating, 0) / leads.filter(l => l.rating).length || 0
    };
  }
}

// Singleton Export
export const leadDatabase = new LeadDatabase();
export default leadDatabase;
