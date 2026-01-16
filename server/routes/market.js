/**
 * Market Analysis API Routes
 * Whitespace-Analyse, Competitor Intelligence, Akquise-Potenzial
 */

import express from 'express';
import { marketAnalysisService } from '../services/marketAnalysisService.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * GET /api/market/whitespace - Whitespace-Analyse Übersicht
 */
router.get('/whitespace', async (req, res) => {
  try {
    const analysis = await marketAnalysisService.analyzeWhitespace();
    res.json(analysis);
  } catch (error) {
    logger.error('Whitespace Analyse Fehler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/market/whitespace/:city - Detaillierte Analyse für eine Stadt
 */
router.get('/whitespace/:city', async (req, res) => {
  try {
    const { city } = req.params;
    const analysis = await marketAnalysisService.analyzeCity(city);
    res.json(analysis);
  } catch (error) {
    logger.error('Stadt-Analyse Fehler', { city: req.params.city, error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/market/top-cities - Top Akquise-Städte
 */
router.get('/top-cities', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const result = await marketAnalysisService.getTopAcquisitionCities(parseInt(limit));
    res.json(result);
  } catch (error) {
    logger.error('Top Cities Fehler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/market/maklers/:location - Makler in einer Region finden
 */
router.get('/maklers/:location', async (req, res) => {
  try {
    const { location } = req.params;
    const { radius = 10 } = req.query;
    const result = await marketAnalysisService.findMaklersInArea(location, parseFloat(radius));
    res.json(result);
  } catch (error) {
    logger.error('Makler-Suche Fehler', { location: req.params.location, error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/market/scan - Competitor Scan für mehrere Städte
 */
router.post('/scan', async (req, res) => {
  try {
    const { cities } = req.body;
    
    if (!cities || !Array.isArray(cities) || cities.length === 0) {
      return res.status(400).json({ error: 'cities Array erforderlich' });
    }

    if (cities.length > 10) {
      return res.status(400).json({ error: 'Maximal 10 Städte pro Scan' });
    }

    logger.info('Starte Competitor Scan', { cities });
    const result = await marketAnalysisService.scanCompetitors(cities);
    res.json(result);
  } catch (error) {
    logger.error('Competitor Scan Fehler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/market/prospects/:city - Top Akquise-Prospects in einer Stadt
 */
router.get('/prospects/:city', async (req, res) => {
  try {
    const { city } = req.params;
    const { limit = 10 } = req.query;
    
    const analysis = await marketAnalysisService.analyzeCity(city);
    
    res.json({
      city,
      totalProspects: analysis.analysis.potential,
      whitespaceScore: analysis.analysis.whitespaceScore,
      prospects: analysis.topProspects.slice(0, parseInt(limit))
    });
  } catch (error) {
    logger.error('Prospects Fehler', { city: req.params.city, error: error.message });
    res.status(500).json({ error: error.message });
  }
});

export default router;
