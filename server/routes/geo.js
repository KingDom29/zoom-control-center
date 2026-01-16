/**
 * Geocoding API Routes
 * Regionale Segmentierung für Kampagnen-Kontakte
 */

import express from 'express';
import { geocodingService } from '../services/geocodingService.js';
import { campaignService } from '../services/campaignService.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * POST /api/geo/geocode - Einzelne Adresse geocoden
 */
router.post('/geocode', async (req, res) => {
  try {
    const { address } = req.body;
    
    if (!address) {
      return res.status(400).json({ error: 'Adresse erforderlich' });
    }

    const result = await geocodingService.geocodeAddress(address);
    
    if (!result) {
      return res.status(404).json({ error: 'Adresse konnte nicht geocodiert werden' });
    }

    res.json(result);
  } catch (error) {
    logger.error('Geocode Endpoint Fehler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/geo/geocode/campaign - Alle Kampagnen-Kontakte geocoden
 */
router.post('/geocode/campaign', async (req, res) => {
  try {
    const { limit, skipExisting = true } = req.body;
    let contacts = campaignService.campaign?.contacts || [];
    
    if (limit && limit > 0) {
      contacts = contacts.slice(0, limit);
    }

    logger.info('Starte Batch-Geocoding', { total: contacts.length, skipExisting });

    const result = await geocodingService.geocodeContacts(contacts);
    
    // Aktualisierte Kontakte in Kampagne speichern
    if (result.geocoded > 0) {
      // Merge zurück in alle Kontakte
      const allContacts = campaignService.campaign.contacts;
      for (const updatedContact of result.contacts) {
        const idx = allContacts.findIndex(c => c.id === updatedContact.id);
        if (idx >= 0) {
          allContacts[idx] = updatedContact;
        }
      }
      campaignService.saveCampaign();
    }
    
    res.json({
      success: true,
      total: contacts.length,
      geocoded: result.geocoded,
      failed: result.failed,
      skipped: result.skipped
    });
  } catch (error) {
    logger.error('Batch Geocode Fehler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/geo/stats - Geo-Statistiken
 */
router.get('/stats', (req, res) => {
  try {
    const contacts = campaignService.campaign?.contacts || [];
    const stats = geocodingService.getGeoStats(contacts);
    res.json(stats);
  } catch (error) {
    logger.error('Geo Stats Fehler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/geo/by-region - Kontakte nach Region gruppiert
 */
router.get('/by-region', (req, res) => {
  try {
    const contacts = campaignService.campaign?.contacts || [];
    const groups = geocodingService.groupByRegion(contacts);
    res.json(groups);
  } catch (error) {
    logger.error('By Region Fehler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/geo/nearby - Kontakte in der Nähe
 */
router.get('/nearby', (req, res) => {
  try {
    const { lat, lng, radius = 50 } = req.query;
    
    if (!lat || !lng) {
      return res.status(400).json({ error: 'lat und lng Parameter erforderlich' });
    }

    const contacts = campaignService.campaign?.contacts || [];
    const nearby = geocodingService.findNearbyContacts(
      contacts, 
      parseFloat(lat), 
      parseFloat(lng), 
      parseFloat(radius)
    );
    
    res.json({ 
      count: nearby.length, 
      radius: parseFloat(radius),
      center: { lat: parseFloat(lat), lng: parseFloat(lng) },
      contacts: nearby 
    });
  } catch (error) {
    logger.error('Nearby Fehler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/geo/map-data - Karten-Daten für Visualisierung
 */
router.get('/map-data', (req, res) => {
  try {
    const contacts = campaignService.campaign?.contacts || [];
    const mapData = geocodingService.getMapData(contacts);
    res.json({ 
      count: mapData.length, 
      total: contacts.length,
      points: mapData 
    });
  } catch (error) {
    logger.error('Map Data Fehler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/geo/cities - Top-Städte mit Kontakten
 */
router.get('/cities', (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const contacts = campaignService.campaign?.contacts || [];
    const stats = geocodingService.getGeoStats(contacts);
    
    res.json({
      total: stats.geocoded,
      cities: stats.topCities.slice(0, parseInt(limit))
    });
  } catch (error) {
    logger.error('Cities Fehler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/geo/cache - Cache leeren
 */
router.delete('/cache', (req, res) => {
  try {
    const cleared = geocodingService.clearCache();
    res.json({ success: true, entriesCleared: cleared });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
