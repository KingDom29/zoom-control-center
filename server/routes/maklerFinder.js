/**
 * Makler-Finder API Routes
 * Google Places Integration für Immobilienmakler-Suche
 */

import express from 'express';
import { googlePlacesService } from '../services/googlePlaces.js';
import { leadDatabase } from '../services/leadDatabase.js';
import logger from '../utils/logger.js';

const router = express.Router();

// GET /api/makler-finder/search - Makler suchen
router.get('/search', async (req, res) => {
  try {
    const { location, radius = 10000, query = 'Immobilienmakler' } = req.query;
    
    if (!location) {
      return res.status(400).json({ 
        success: false, 
        error: 'Location (Stadt/PLZ) erforderlich' 
      });
    }

    const results = await googlePlacesService.searchMakler(query, location, parseInt(radius));
    
    // Check welche bereits in DB sind
    const resultsWithDbStatus = results.results.map(place => ({
      ...place,
      isInDatabase: !!leadDatabase.getLeadByPlaceId(place.place_id),
      existingLeadId: leadDatabase.getLeadByPlaceId(place.place_id)?.id || null
    }));

    res.json({
      success: true,
      ...results,
      results: resultsWithDbStatus
    });
  } catch (error) {
    logger.error('Makler search error', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/makler-finder/text-search - Flexible Textsuche
router.get('/text-search', async (req, res) => {
  try {
    const { query, location } = req.query;
    
    if (!query || !location) {
      return res.status(400).json({ 
        success: false, 
        error: 'Query und Location erforderlich' 
      });
    }

    const results = await googlePlacesService.textSearch(query, location);
    
    // Check welche bereits in DB sind
    const resultsWithDbStatus = results.results.map(place => ({
      ...place,
      isInDatabase: !!leadDatabase.getLeadByPlaceId(place.place_id),
      existingLeadId: leadDatabase.getLeadByPlaceId(place.place_id)?.id || null
    }));

    res.json({
      success: true,
      ...results,
      results: resultsWithDbStatus
    });
  } catch (error) {
    logger.error('Text search error', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/makler-finder/details/:placeId - Place Details abrufen
router.get('/details/:placeId', async (req, res) => {
  try {
    const details = await googlePlacesService.getPlaceDetails(req.params.placeId);
    
    if (!details) {
      return res.status(404).json({ 
        success: false, 
        error: 'Place nicht gefunden' 
      });
    }

    // Check ob bereits in DB
    const existingLead = leadDatabase.getLeadByPlaceId(req.params.placeId);

    res.json({
      success: true,
      place: details,
      isInDatabase: !!existingLead,
      existingLeadId: existingLead?.id || null
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/makler-finder/import - Einzelnen Makler als Lead importieren
router.post('/import', async (req, res) => {
  try {
    const { placeId } = req.body;
    
    if (!placeId) {
      return res.status(400).json({ 
        success: false, 
        error: 'placeId erforderlich' 
      });
    }

    // Check for duplicate
    const existing = leadDatabase.getLeadByPlaceId(placeId);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'Makler bereits in Datenbank',
        existingLeadId: existing.id
      });
    }

    // Get details from Google
    const details = await googlePlacesService.getPlaceDetails(placeId);
    if (!details) {
      return res.status(404).json({ 
        success: false, 
        error: 'Place nicht gefunden' 
      });
    }

    // Create lead
    const lead = leadDatabase.createLead({
      placeId: details.place_id,
      name: details.name,
      company: details.name,
      address: details.formatted_address,
      phone: details.formatted_phone_number || details.international_phone_number || '',
      website: details.website || '',
      rating: details.rating,
      reviewCount: details.user_ratings_total || 0,
      openingHours: details.opening_hours?.weekday_text || [],
      location: details.geometry?.location || null,
      source: 'google_places'
    });

    res.status(201).json({ success: true, lead });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/makler-finder/import-bulk - Mehrere Makler importieren
router.post('/import-bulk', async (req, res) => {
  try {
    const { placeIds } = req.body;
    
    if (!placeIds || !Array.isArray(placeIds)) {
      return res.status(400).json({ 
        success: false, 
        error: 'placeIds Array erforderlich' 
      });
    }

    const results = {
      imported: [],
      skipped: [],
      errors: []
    };

    for (const placeId of placeIds) {
      try {
        // Check for duplicate
        const existing = leadDatabase.getLeadByPlaceId(placeId);
        if (existing) {
          results.skipped.push({ placeId, reason: 'duplicate', existingLeadId: existing.id });
          continue;
        }

        // Get details
        const details = await googlePlacesService.getPlaceDetails(placeId);
        if (!details) {
          results.errors.push({ placeId, error: 'Place nicht gefunden' });
          continue;
        }

        // Create lead
        const lead = leadDatabase.createLead({
          placeId: details.place_id,
          name: details.name,
          company: details.name,
          address: details.formatted_address,
          phone: details.formatted_phone_number || details.international_phone_number || '',
          website: details.website || '',
          rating: details.rating,
          reviewCount: details.user_ratings_total || 0,
          openingHours: details.opening_hours?.weekday_text || [],
          location: details.geometry?.location || null,
          source: 'google_places'
        });

        results.imported.push(lead);
      } catch (err) {
        results.errors.push({ placeId, error: err.message });
      }
    }

    res.json({
      success: true,
      summary: {
        total: placeIds.length,
        imported: results.imported.length,
        skipped: results.skipped.length,
        errors: results.errors.length
      },
      results
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/makler-finder/autocomplete - Ortssuche Autocomplete
router.get('/autocomplete', async (req, res) => {
  try {
    const { input } = req.query;
    
    if (!input || input.length < 2) {
      return res.json({ success: true, predictions: [] });
    }

    const predictions = await googlePlacesService.autocomplete(input);
    res.json({ success: true, predictions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/makler-finder/next-page - Nächste Seite laden
router.get('/next-page', async (req, res) => {
  try {
    const { pageToken } = req.query;
    
    if (!pageToken) {
      return res.status(400).json({ 
        success: false, 
        error: 'pageToken erforderlich' 
      });
    }

    const results = await googlePlacesService.getNextPage(pageToken);
    
    if (!results) {
      return res.json({ success: true, count: 0, results: [], nextPageToken: null });
    }

    // Check welche bereits in DB sind
    const resultsWithDbStatus = results.results.map(place => ({
      ...place,
      isInDatabase: !!leadDatabase.getLeadByPlaceId(place.place_id),
      existingLeadId: leadDatabase.getLeadByPlaceId(place.place_id)?.id || null
    }));

    res.json({
      success: true,
      ...results,
      results: resultsWithDbStatus
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
