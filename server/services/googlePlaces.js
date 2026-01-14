/**
 * Google Places API Service
 * Makler-Finder für Immobilienmakler in einer Region
 */

import axios from 'axios';
import logger from '../utils/logger.js';

const GOOGLE_PLACES_BASE_URL = 'https://maps.googleapis.com/maps/api/place';

class GooglePlacesService {
  constructor() {
    this.apiKey = process.env.GOOGLE_PLACES_API_KEY;
  }

  /**
   * Suche nach Immobilienmaklern in einer Region
   * @param {string} query - Suchbegriff (z.B. "Immobilienmakler")
   * @param {string} location - Stadt oder PLZ
   * @param {number} radius - Suchradius in Metern (default: 10000 = 10km)
   */
  async searchMakler(query = 'Immobilienmakler', location, radius = 10000) {
    if (!this.apiKey) {
      throw new Error('GOOGLE_PLACES_API_KEY nicht konfiguriert');
    }

    try {
      // Erst Geocoding für Location
      const geoResult = await this.geocodeLocation(location);
      if (!geoResult) {
        throw new Error(`Location "${location}" konnte nicht gefunden werden`);
      }

      const { lat, lng } = geoResult;

      // Nearby Search
      const response = await axios.get(`${GOOGLE_PLACES_BASE_URL}/nearbysearch/json`, {
        params: {
          key: this.apiKey,
          location: `${lat},${lng}`,
          radius: radius,
          keyword: query,
          type: 'real_estate_agency',
          language: 'de'
        }
      });

      if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
        throw new Error(`Google Places API Error: ${response.data.status}`);
      }

      const results = response.data.results || [];
      
      // Details für jeden Treffer abrufen
      const detailedResults = await Promise.all(
        results.slice(0, 20).map(place => this.getPlaceDetails(place.place_id))
      );

      return {
        query,
        location,
        coordinates: { lat, lng },
        radius,
        count: detailedResults.length,
        results: detailedResults.filter(r => r !== null),
        nextPageToken: response.data.next_page_token || null
      };
    } catch (error) {
      logger.error('Google Places Search Error', { error: error.message });
      throw error;
    }
  }

  /**
   * Text-basierte Suche (flexibler)
   */
  async textSearch(query, location) {
    if (!this.apiKey) {
      throw new Error('GOOGLE_PLACES_API_KEY nicht konfiguriert');
    }

    try {
      const searchQuery = `${query} in ${location}`;
      
      const response = await axios.get(`${GOOGLE_PLACES_BASE_URL}/textsearch/json`, {
        params: {
          key: this.apiKey,
          query: searchQuery,
          type: 'real_estate_agency',
          language: 'de'
        }
      });

      if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
        throw new Error(`Google Places API Error: ${response.data.status}`);
      }

      const results = response.data.results || [];
      
      // Details für jeden Treffer abrufen
      const detailedResults = await Promise.all(
        results.slice(0, 20).map(place => this.getPlaceDetails(place.place_id))
      );

      return {
        query: searchQuery,
        count: detailedResults.length,
        results: detailedResults.filter(r => r !== null),
        nextPageToken: response.data.next_page_token || null
      };
    } catch (error) {
      logger.error('Google Places Text Search Error', { error: error.message });
      throw error;
    }
  }

  /**
   * Details zu einem Place abrufen
   */
  async getPlaceDetails(placeId) {
    try {
      const response = await axios.get(`${GOOGLE_PLACES_BASE_URL}/details/json`, {
        params: {
          key: this.apiKey,
          place_id: placeId,
          fields: [
            'place_id',
            'name',
            'formatted_address',
            'formatted_phone_number',
            'international_phone_number',
            'website',
            'url',
            'rating',
            'user_ratings_total',
            'opening_hours',
            'geometry',
            'business_status',
            'types'
          ].join(','),
          language: 'de'
        }
      });

      if (response.data.status !== 'OK') {
        logger.warn(`Place details error for ${placeId}: ${response.data.status}`);
        return null;
      }

      const place = response.data.result;
      
      return {
        place_id: place.place_id,
        name: place.name,
        formatted_address: place.formatted_address,
        formatted_phone_number: place.formatted_phone_number,
        international_phone_number: place.international_phone_number,
        website: place.website,
        google_maps_url: place.url,
        rating: place.rating,
        user_ratings_total: place.user_ratings_total,
        opening_hours: place.opening_hours,
        geometry: place.geometry,
        business_status: place.business_status,
        types: place.types
      };
    } catch (error) {
      logger.error(`Error fetching place details for ${placeId}`, { error: error.message });
      return null;
    }
  }

  /**
   * Location zu Koordinaten umwandeln
   */
  async geocodeLocation(location) {
    try {
      const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
        params: {
          key: this.apiKey,
          address: location,
          language: 'de',
          region: 'de'
        }
      });

      if (response.data.status !== 'OK' || !response.data.results.length) {
        return null;
      }

      const result = response.data.results[0];
      return {
        lat: result.geometry.location.lat,
        lng: result.geometry.location.lng,
        formatted_address: result.formatted_address
      };
    } catch (error) {
      logger.error('Geocoding error', { error: error.message });
      return null;
    }
  }

  /**
   * Nächste Seite der Ergebnisse laden
   */
  async getNextPage(pageToken) {
    if (!pageToken) return null;

    // Google requires a short delay before using next_page_token
    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
      const response = await axios.get(`${GOOGLE_PLACES_BASE_URL}/nearbysearch/json`, {
        params: {
          key: this.apiKey,
          pagetoken: pageToken
        }
      });

      if (response.data.status !== 'OK') {
        return null;
      }

      const results = response.data.results || [];
      const detailedResults = await Promise.all(
        results.slice(0, 20).map(place => this.getPlaceDetails(place.place_id))
      );

      return {
        count: detailedResults.length,
        results: detailedResults.filter(r => r !== null),
        nextPageToken: response.data.next_page_token || null
      };
    } catch (error) {
      logger.error('Next page error', { error: error.message });
      return null;
    }
  }

  /**
   * Autocomplete für Ortssuche
   */
  async autocomplete(input) {
    try {
      const response = await axios.get(`${GOOGLE_PLACES_BASE_URL}/autocomplete/json`, {
        params: {
          key: this.apiKey,
          input: input,
          types: '(cities)',
          language: 'de',
          components: 'country:de|country:at|country:ch'
        }
      });

      if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
        return [];
      }

      return response.data.predictions.map(p => ({
        description: p.description,
        place_id: p.place_id,
        main_text: p.structured_formatting?.main_text,
        secondary_text: p.structured_formatting?.secondary_text
      }));
    } catch (error) {
      logger.error('Autocomplete error', { error: error.message });
      return [];
    }
  }
}

export const googlePlacesService = new GooglePlacesService();
export default googlePlacesService;
