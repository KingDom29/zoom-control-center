/**
 * Market Analysis Service
 * Whitespace-Analyse, Competitor Intelligence, Geo-Scoring
 */

import axios from 'axios';
import logger from '../utils/logger.js';
import { campaignService } from './campaignService.js';
import { geocodingService } from './geocodingService.js';

const GOOGLE_PLACES_URL = 'https://maps.googleapis.com/maps/api/place';

class MarketAnalysisService {
  constructor() {
    this.cache = new Map();
    this.lastScan = null;
  }

  get apiKey() {
    return process.env.GOOGLE_GEOCODING_API_KEY || process.env.GOOGLE_PLACES_API_KEY;
  }

  /**
   * Makler in einer Region/Stadt finden
   */
  async findMaklersInArea(location, radiusKm = 10) {
    if (!this.apiKey) {
      throw new Error('Google API Key nicht konfiguriert');
    }

    try {
      // Erst Location geocoden
      const geo = await geocodingService.geocodeAddress(location + ', Deutschland');
      if (!geo) {
        throw new Error(`Location "${location}" nicht gefunden`);
      }

      const radiusMeters = radiusKm * 1000;
      const results = [];
      let nextPageToken = null;

      // Nearby Search für Immobilienmakler
      do {
        const params = {
          key: this.apiKey,
          location: `${geo.lat},${geo.lng}`,
          radius: radiusMeters,
          keyword: 'Immobilienmakler',
          type: 'real_estate_agency',
          language: 'de'
        };

        if (nextPageToken) {
          params.pagetoken = nextPageToken;
          await new Promise(r => setTimeout(r, 2000)); // Google requires delay
        }

        const response = await axios.get(`${GOOGLE_PLACES_URL}/nearbysearch/json`, { params });

        if (response.data.status === 'OK') {
          results.push(...response.data.results);
        }

        nextPageToken = response.data.next_page_token;
      } while (nextPageToken && results.length < 60);

      // Details für Top-Ergebnisse abrufen
      const detailed = await Promise.all(
        results.slice(0, 20).map(p => this.getPlaceDetails(p.place_id))
      );

      return {
        location,
        coordinates: { lat: geo.lat, lng: geo.lng },
        radius: radiusKm,
        totalFound: results.length,
        maklers: detailed.filter(m => m !== null),
        scannedAt: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Makler-Suche Fehler', { location, error: error.message });
      throw error;
    }
  }

  /**
   * Place Details abrufen
   */
  async getPlaceDetails(placeId) {
    try {
      const response = await axios.get(`${GOOGLE_PLACES_URL}/details/json`, {
        params: {
          key: this.apiKey,
          place_id: placeId,
          fields: 'place_id,name,formatted_address,formatted_phone_number,website,rating,user_ratings_total,business_status,geometry',
          language: 'de'
        }
      });

      if (response.data.status !== 'OK') return null;

      const p = response.data.result;
      return {
        placeId: p.place_id,
        name: p.name,
        address: p.formatted_address,
        phone: p.formatted_phone_number,
        website: p.website,
        rating: p.rating || 0,
        reviewCount: p.user_ratings_total || 0,
        status: p.business_status,
        lat: p.geometry?.location?.lat,
        lng: p.geometry?.location?.lng,
        score: this.calculateMaklerScore(p)
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Makler-Score berechnen
   */
  calculateMaklerScore(place) {
    let score = 50; // Basis

    // Rating (0-5 → 0-25 Punkte)
    if (place.rating) {
      score += (place.rating / 5) * 25;
    }

    // Review-Anzahl (logarithmisch, max 25 Punkte)
    if (place.user_ratings_total) {
      score += Math.min(25, Math.log10(place.user_ratings_total + 1) * 12);
    }

    // Website vorhanden (+10)
    if (place.website) score += 10;

    // Business aktiv (-20 wenn geschlossen)
    if (place.business_status !== 'OPERATIONAL') score -= 20;

    return Math.round(Math.max(0, Math.min(100, score)));
  }

  /**
   * Whitespace-Analyse: Gebiete mit Potenzial ohne Kunden
   */
  async analyzeWhitespace(options = {}) {
    const { minMaklers = 5, maxCustomerRatio = 0.1 } = options;
    
    const contacts = campaignService.campaign?.contacts || [];
    
    // Kontakte nach PLZ gruppieren
    const customersByPLZ = {};
    const customersByCity = {};
    
    for (const contact of contacts) {
      const plz = contact.PLZ || contact.plz || contact.geo?.postalCode;
      const city = contact.Stadt || contact.Ort || contact.city || contact.geo?.city;
      
      if (plz) {
        customersByPLZ[plz] = (customersByPLZ[plz] || 0) + 1;
      }
      if (city) {
        customersByCity[city] = (customersByCity[city] || 0) + 1;
      }
    }

    // Alle einzigartigen Städte aus Kontakten
    const cities = [...new Set(contacts
      .map(c => c.Stadt || c.Ort || c.city || c.geo?.city)
      .filter(Boolean)
    )];

    logger.info('Whitespace-Analyse', { 
      totalContacts: contacts.length, 
      uniqueCities: cities.length,
      plzCovered: Object.keys(customersByPLZ).length
    });

    return {
      summary: {
        totalContacts: contacts.length,
        uniqueCities: cities.length,
        plzCovered: Object.keys(customersByPLZ).length
      },
      byCity: Object.entries(customersByCity)
        .map(([city, count]) => ({ city, customers: count }))
        .sort((a, b) => b.customers - a.customers),
      byPLZ: Object.entries(customersByPLZ)
        .map(([plz, count]) => ({ plz, customers: count }))
        .sort((a, b) => b.customers - a.customers),
      analyzedAt: new Date().toISOString()
    };
  }

  /**
   * Detaillierte Whitespace-Analyse für eine Stadt
   */
  async analyzeCity(city) {
    const contacts = campaignService.campaign?.contacts || [];
    
    // Kunden in dieser Stadt
    const cityCustomers = contacts.filter(c => {
      const contactCity = c.Stadt || c.Ort || c.city || c.geo?.city;
      return contactCity?.toLowerCase() === city.toLowerCase();
    });

    // Makler in dieser Stadt finden
    let maklers = [];
    try {
      const result = await this.findMaklersInArea(city, 15);
      maklers = result.maklers || [];
    } catch (error) {
      logger.warn('Konnte Makler nicht laden', { city, error: error.message });
    }

    // Überschneidung prüfen (welche Makler sind schon Kunden?)
    const customerEmails = new Set(cityCustomers.map(c => 
      (c.Email || c.email || '').toLowerCase()
    ));
    const customerNames = new Set(cityCustomers.map(c => 
      (c.Firma || c.firma || c.company || '').toLowerCase()
    ));

    const maklersNotCustomers = maklers.filter(m => {
      const nameMatch = customerNames.has(m.name?.toLowerCase());
      return !nameMatch;
    });

    // Whitespace Score berechnen
    const totalMaklers = maklers.length;
    const ourCustomers = cityCustomers.length;
    const penetration = totalMaklers > 0 ? (ourCustomers / totalMaklers) * 100 : 0;
    const whitespaceScore = Math.round(100 - penetration);

    return {
      city,
      analysis: {
        totalMaklers,
        ourCustomers,
        penetration: `${penetration.toFixed(1)}%`,
        whitespaceScore,
        potential: maklersNotCustomers.length
      },
      topProspects: maklersNotCustomers
        .sort((a, b) => b.score - a.score)
        .slice(0, 10),
      existingCustomers: cityCustomers.slice(0, 5).map(c => ({
        name: `${c.Vorname || ''} ${c.Nachname || ''}`.trim(),
        company: c.Firma || c.firma,
        email: c.Email || c.email
      })),
      analyzedAt: new Date().toISOString()
    };
  }

  /**
   * Top-Städte für Akquise identifizieren
   */
  async getTopAcquisitionCities(limit = 10) {
    const contacts = campaignService.campaign?.contacts || [];
    
    // Kontakte nach Stadt gruppieren
    const byCity = {};
    for (const contact of contacts) {
      const city = contact.Stadt || contact.Ort || contact.city || contact.geo?.city;
      if (city) {
        if (!byCity[city]) {
          byCity[city] = { customers: 0, state: null };
        }
        byCity[city].customers++;
        if (!byCity[city].state) {
          byCity[city].state = contact.geo?.state || null;
        }
      }
    }

    // Nach Kundenanzahl sortieren (invertiert - weniger Kunden = mehr Potenzial)
    const cities = Object.entries(byCity)
      .map(([city, data]) => ({
        city,
        customers: data.customers,
        state: data.state,
        priority: data.customers <= 2 ? 'HIGH' : data.customers <= 5 ? 'MEDIUM' : 'LOW'
      }))
      .sort((a, b) => a.customers - b.customers)
      .slice(0, limit);

    return {
      topCities: cities,
      recommendation: 'Städte mit wenigen Kunden haben das größte Wachstumspotenzial',
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Competitor Scan für Monitoring
   */
  async scanCompetitors(cities) {
    const results = [];
    
    for (const city of cities) {
      try {
        const data = await this.findMaklersInArea(city, 10);
        results.push({
          city,
          maklerCount: data.totalFound,
          topMaklers: data.maklers.slice(0, 5),
          scannedAt: data.scannedAt
        });
        
        // Rate limiting
        await new Promise(r => setTimeout(r, 1000));
      } catch (error) {
        results.push({
          city,
          error: error.message
        });
      }
    }

    this.lastScan = new Date().toISOString();
    return {
      cities: results,
      totalScanned: cities.length,
      lastScan: this.lastScan
    };
  }
}

export const marketAnalysisService = new MarketAnalysisService();
export default marketAnalysisService;
