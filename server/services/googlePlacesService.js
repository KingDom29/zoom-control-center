/**
 * Google Places API Service
 * Sucht Immobilienmakler in deutschen Städten
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

// Lade alle deutschen Landkreise
function loadDistricts() {
  try {
    const filePath = path.join(__dirname, '../data/german-districts.json');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return data.districts;
  } catch (e) {
    logger.error('Fehler beim Laden der Landkreise', { error: e.message });
    return [];
  }
}

const GERMAN_DISTRICTS = loadDistricts();

class GooglePlacesService {
  constructor() {
    this.apiKey = GOOGLE_API_KEY;
    this.baseUrl = 'https://maps.googleapis.com/maps/api/place';
    this.minRating = 4.2;
  }

  /**
   * Sucht Immobilienmakler in einer Stadt
   */
  async searchRealtorsInCity(city, radius = 20000) {
    if (!this.apiKey) {
      throw new Error('GOOGLE_PLACES_API_KEY nicht konfiguriert');
    }

    const searchTerms = [
      'Immobilienmakler',
      'Immobilienbüro',
      'Real Estate Agent'
    ];

    const allResults = [];

    for (const term of searchTerms) {
      try {
        const response = await axios.get(`${this.baseUrl}/nearbysearch/json`, {
          params: {
            location: `${city.lat},${city.lng}`,
            radius,
            keyword: term,
            type: 'real_estate_agency',
            language: 'de',
            key: this.apiKey
          }
        });

        if (response.data.status === 'OK') {
          allResults.push(...response.data.results);
        }

        // Rate limiting
        await this.sleep(200);

      } catch (error) {
        logger.error(`Places search error for ${term} in ${city.name}`, { error: error.message });
      }
    }

    // Deduplizieren nach place_id
    const uniqueResults = this.deduplicateByPlaceId(allResults);
    
    // Filtern nach Rating
    const qualifiedResults = uniqueResults.filter(place => 
      place.rating && place.rating >= this.minRating
    );

    logger.info(`📍 ${city.name}: ${qualifiedResults.length} Makler mit ${this.minRating}+ Sternen gefunden`);
    
    return qualifiedResults;
  }

  /**
   * Holt Details zu einem Place (inkl. E-Mail, Website, Telefon)
   */
  async getPlaceDetails(placeId) {
    if (!this.apiKey) {
      throw new Error('GOOGLE_PLACES_API_KEY nicht konfiguriert');
    }

    try {
      const response = await axios.get(`${this.baseUrl}/details/json`, {
        params: {
          place_id: placeId,
          fields: 'name,formatted_address,formatted_phone_number,international_phone_number,website,email,rating,user_ratings_total,opening_hours,url,business_status',
          language: 'de',
          key: this.apiKey
        }
      });

      if (response.data.status === 'OK') {
        return response.data.result;
      }

      return null;
    } catch (error) {
      logger.error(`Place details error for ${placeId}`, { error: error.message });
      return null;
    }
  }

  /**
   * Extrahiert E-Mail von Website (falls nicht in Places)
   */
  async scrapeEmailFromWebsite(websiteUrl) {
    if (!websiteUrl) return null;

    try {
      const response = await axios.get(websiteUrl, {
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; MaklerplanBot/1.0)'
        }
      });

      const html = response.data;
      
      // E-Mail Pattern
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const emails = html.match(emailRegex) || [];
      
      // Filtere generische E-Mails raus
      const validEmails = emails.filter(email => 
        !email.includes('example.com') &&
        !email.includes('domain.com') &&
        !email.includes('sentry') &&
        !email.includes('wixpress') &&
        !email.includes('.png') &&
        !email.includes('.jpg')
      );

      return validEmails[0] || null;
    } catch (error) {
      // Website nicht erreichbar - ignorieren
      return null;
    }
  }

  /**
   * Sucht die Top 10 Makler in einem Landkreis
   */
  async searchTopRealtorsInDistrict(district, maxResults = 10) {
    const results = await this.searchRealtorsInCity(district, 25000);
    
    // Sortiere nach Rating (höchstes zuerst)
    const sorted = results
      .filter(p => p.rating >= this.minRating)
      .sort((a, b) => {
        // Erst nach Rating, dann nach Anzahl Bewertungen
        if (b.rating !== a.rating) return b.rating - a.rating;
        return (b.user_ratings_total || 0) - (a.user_ratings_total || 0);
      })
      .slice(0, maxResults);
    
    return sorted;
  }

  /**
   * Holt alle Landkreise
   */
  getAllDistricts() {
    return GERMAN_DISTRICTS;
  }

  /**
   * Holt einen Landkreis nach Index
   */
  getDistrictByIndex(index) {
    return GERMAN_DISTRICTS[index] || null;
  }

  /**
   * Komplette Suche in allen deutschen Landkreisen
   */
  async searchAllGermanDistricts(options = {}) {
    const { 
      startIndex = 0,
      maxDistricts = 5, 
      maxPerDistrict = 10,
      minRating = 4.2,
      onlyWithEmail = true 
    } = options;

    this.minRating = minRating;
    const allLeads = [];
    const districts = GERMAN_DISTRICTS.slice(startIndex, startIndex + maxDistricts);

    for (const district of districts) {
      logger.info(`🔍 Suche Top ${maxPerDistrict} Makler in ${district.name}...`);
      
      const results = await this.searchTopRealtorsInDistrict(district, maxPerDistrict);
      
      for (const place of results) {
        // Details abrufen
        const details = await this.getPlaceDetails(place.place_id);
        await this.sleep(300); // Rate limiting

        if (!details) continue;

        // E-Mail suchen
        let email = details.email;
        if (!email && details.website) {
          email = await this.scrapeEmailFromWebsite(details.website);
        }

        // Nur mit E-Mail wenn gewünscht
        if (onlyWithEmail && !email) continue;

        allLeads.push({
          place_id: place.place_id,
          name: details.name,
          address: details.formatted_address,
          phone: details.formatted_phone_number || details.international_phone_number,
          website: details.website,
          email: email,
          rating: details.rating,
          reviewCount: details.user_ratings_total,
          district: district.name,
          state: district.state,
          googleMapsUrl: details.url,
          businessStatus: details.business_status
        });
      }
      
      logger.info(`📍 ${district.name}: ${results.length} Makler gefunden`);
    }

    logger.info(`✅ Gesamt: ${allLeads.length} qualifizierte Leads gefunden`);
    return allLeads;
  }

  /**
   * Dedupliziert nach place_id
   */
  deduplicateByPlaceId(results) {
    const seen = new Set();
    return results.filter(place => {
      if (seen.has(place.place_id)) return false;
      seen.add(place.place_id);
      return true;
    });
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const googlePlacesService = new GooglePlacesService();
export default googlePlacesService;
