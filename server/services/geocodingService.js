/**
 * Geocoding Service für Kampagnen-Kontakte
 * Regionale Segmentierung, Koordinaten, Entfernungsberechnung
 */

import axios from 'axios';
import logger from '../utils/logger.js';

const GOOGLE_GEOCODING_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

class GeocodingService {
  constructor() {
    this.cache = new Map();
  }

  get apiKey() {
    return process.env.GOOGLE_GEOCODING_API_KEY || process.env.GOOGLE_PLACES_API_KEY;
  }

  /**
   * Adresse → Koordinaten + Region
   */
  async geocodeAddress(address) {
    if (!address || !address.trim()) return null;
    
    // Cache prüfen
    const cacheKey = address.toLowerCase().trim();
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    if (!this.apiKey) {
      logger.warn('Geocoding API Key nicht konfiguriert');
      return null;
    }

    try {
      const response = await axios.get(GOOGLE_GEOCODING_URL, {
        params: {
          key: this.apiKey,
          address: address,
          language: 'de',
          region: 'de'
        }
      });

      if (response.data.status !== 'OK' || !response.data.results?.length) {
        logger.warn('Geocoding fehlgeschlagen', { address, status: response.data.status });
        return null;
      }

      const result = response.data.results[0];
      const components = result.address_components;

      const geoData = {
        lat: result.geometry.location.lat,
        lng: result.geometry.location.lng,
        formattedAddress: result.formatted_address,
        placeId: result.place_id,
        street: this.getComponent(components, 'route'),
        streetNumber: this.getComponent(components, 'street_number'),
        postalCode: this.getComponent(components, 'postal_code'),
        city: this.getComponent(components, 'locality') || 
              this.getComponent(components, 'administrative_area_level_3'),
        district: this.getComponent(components, 'sublocality') || 
                  this.getComponent(components, 'administrative_area_level_4'),
        state: this.getComponent(components, 'administrative_area_level_1'),
        stateShort: this.getComponent(components, 'administrative_area_level_1', true),
        country: this.getComponent(components, 'country'),
        countryCode: this.getComponent(components, 'country', true)
      };

      // Region bestimmen (für Deutschland)
      geoData.region = this.determineRegion(geoData);

      // Cache speichern
      this.cache.set(cacheKey, geoData);
      
      logger.info('Adresse geocodiert', { address, city: geoData.city, region: geoData.region });
      return geoData;

    } catch (error) {
      logger.error('Geocoding Fehler', { address, error: error.message });
      return null;
    }
  }

  /**
   * Komponente aus Address-Components extrahieren
   */
  getComponent(components, type, short = false) {
    const component = components?.find(c => c.types.includes(type));
    return component ? (short ? component.short_name : component.long_name) : null;
  }

  /**
   * Region für Deutschland bestimmen
   */
  determineRegion(geoData) {
    const stateRegions = {
      'Bayern': 'Süd',
      'Baden-Württemberg': 'Süd',
      'Hessen': 'Mitte',
      'Rheinland-Pfalz': 'West',
      'Saarland': 'West',
      'Nordrhein-Westfalen': 'West',
      'Niedersachsen': 'Nord',
      'Schleswig-Holstein': 'Nord',
      'Hamburg': 'Nord',
      'Bremen': 'Nord',
      'Mecklenburg-Vorpommern': 'Nord-Ost',
      'Brandenburg': 'Ost',
      'Berlin': 'Ost',
      'Sachsen': 'Ost',
      'Sachsen-Anhalt': 'Ost',
      'Thüringen': 'Ost'
    };
    return stateRegions[geoData.state] || 'Unbekannt';
  }

  /**
   * Mehrere Kontakte geocoden (Batch)
   */
  async geocodeContacts(contacts, options = {}) {
    const { delayMs = 50, maxConcurrent = 1 } = options;
    const results = [];
    let geocoded = 0;
    let failed = 0;
    let skipped = 0;

    for (const contact of contacts) {
      // Bereits geocodiert?
      if (contact.geo?.lat && contact.geo?.lng) {
        results.push(contact);
        skipped++;
        continue;
      }

      // Adresse zusammenbauen
      const address = this.buildAddress(contact);

      if (address) {
        const geoData = await this.geocodeAddress(address);
        if (geoData) {
          results.push({ ...contact, geo: geoData });
          geocoded++;
        } else {
          results.push(contact);
          failed++;
        }
        // Rate Limit
        await new Promise(r => setTimeout(r, delayMs));
      } else {
        results.push(contact);
        failed++;
      }
    }

    logger.info('Batch Geocoding abgeschlossen', { geocoded, failed, skipped, total: contacts.length });
    return { contacts: results, geocoded, failed, skipped };
  }

  /**
   * Adresse aus Kontakt-Feldern zusammenbauen
   */
  buildAddress(contact) {
    const parts = [];
    
    // Straße
    if (contact.Strasse || contact.strasse || contact.street) {
      parts.push(contact.Strasse || contact.strasse || contact.street);
    }
    
    // PLZ + Stadt
    const plz = contact.PLZ || contact.plz || contact.postalCode || '';
    const city = contact.Stadt || contact.Ort || contact.city || contact.ort || '';
    
    if (plz || city) {
      parts.push(`${plz} ${city}`.trim());
    }
    
    // Fallback: Firma + Deutschland
    if (parts.length === 0 && (contact.Firma || contact.firma || contact.company)) {
      parts.push(contact.Firma || contact.firma || contact.company);
      parts.push('Deutschland');
    }

    return parts.join(', ').trim() || null;
  }

  /**
   * Kontakte nach Region gruppieren
   */
  groupByRegion(contacts) {
    const groups = {};
    
    for (const contact of contacts) {
      const region = contact.geo?.region || 'Unbekannt';
      const state = contact.geo?.state || 'Unbekannt';
      const city = contact.geo?.city || 'Unbekannt';

      // Nach Region
      if (!groups[region]) {
        groups[region] = { count: 0, states: {} };
      }
      groups[region].count++;

      // Nach Bundesland
      if (!groups[region].states[state]) {
        groups[region].states[state] = { count: 0, cities: {} };
      }
      groups[region].states[state].count++;

      // Nach Stadt
      if (!groups[region].states[state].cities[city]) {
        groups[region].states[state].cities[city] = 0;
      }
      groups[region].states[state].cities[city]++;
    }

    return groups;
  }

  /**
   * Entfernung zwischen zwei Punkten berechnen (Haversine)
   */
  calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Erdradius in km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLng = this.deg2rad(lng2 - lng1);
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) * 
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  deg2rad(deg) {
    return deg * (Math.PI / 180);
  }

  /**
   * Kontakte in der Nähe finden
   */
  findNearbyContacts(contacts, lat, lng, radiusKm = 50) {
    return contacts
      .filter(c => c.geo?.lat && c.geo?.lng)
      .map(c => ({
        ...c,
        distance: Math.round(this.calculateDistance(lat, lng, c.geo.lat, c.geo.lng) * 10) / 10
      }))
      .filter(c => c.distance <= radiusKm)
      .sort((a, b) => a.distance - b.distance);
  }

  /**
   * Geo-Statistiken generieren
   */
  getGeoStats(contacts) {
    const withGeo = contacts.filter(c => c.geo?.lat && c.geo?.lng);
    const regions = {};
    const states = {};
    const cities = {};

    for (const c of withGeo) {
      const region = c.geo.region || 'Unbekannt';
      const state = c.geo.state || 'Unbekannt';
      const city = c.geo.city || 'Unbekannt';

      regions[region] = (regions[region] || 0) + 1;
      states[state] = (states[state] || 0) + 1;
      cities[city] = (cities[city] || 0) + 1;
    }

    return {
      total: contacts.length,
      geocoded: withGeo.length,
      coverage: contacts.length > 0 
        ? `${Math.round((withGeo.length / contacts.length) * 100)}%` 
        : '0%',
      regions: Object.entries(regions).sort((a, b) => b[1] - a[1]),
      states: Object.entries(states).sort((a, b) => b[1] - a[1]),
      topCities: Object.entries(cities).sort((a, b) => b[1] - a[1]).slice(0, 20)
    };
  }

  /**
   * Karten-Daten für Visualisierung
   */
  getMapData(contacts) {
    return contacts
      .filter(c => c.geo?.lat && c.geo?.lng)
      .map(c => ({
        id: c.id,
        name: `${c.Vorname || c.vorname || ''} ${c.Nachname || c.nachname || ''}`.trim() || c.Firma || c.firma || 'Unbekannt',
        company: c.Firma || c.firma || c.company,
        email: c.Email || c.email,
        lat: c.geo.lat,
        lng: c.geo.lng,
        city: c.geo.city,
        state: c.geo.state,
        region: c.geo.region,
        status: c.status
      }));
  }

  /**
   * Cache leeren
   */
  clearCache() {
    const size = this.cache.size;
    this.cache.clear();
    logger.info('Geocoding Cache geleert', { entries: size });
    return size;
  }
}

export const geocodingService = new GeocodingService();
export default geocodingService;
