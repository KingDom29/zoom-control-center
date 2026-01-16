/**
 * Navigation API Routes
 * AI-powered navigation recommendations
 */

import express from 'express';
import { navigationService } from '../services/navigationService.js';
import logger from '../utils/logger.js';

const router = express.Router();

// POST /api/navigation/track - Track navigation event
router.post('/track', (req, res) => {
  try {
    const { sessionId, route } = req.body;
    
    if (!sessionId || !route) {
      return res.status(400).json({ error: 'sessionId and route required' });
    }
    
    navigationService.trackNavigation(sessionId, route);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error tracking navigation:', { error: error.message });
    res.status(500).json({ error: 'Failed to track navigation' });
  }
});

// GET /api/navigation/recommend - Get navigation recommendation
router.get('/recommend', async (req, res) => {
  try {
    const { sessionId, eventType } = req.query;
    const context = {
      recentRoutes: req.query.recentRoutes?.split(',') || [],
      activeMeetings: parseInt(req.query.activeMeetings) || 0,
      newRecordings: parseInt(req.query.newRecordings) || 0
    };
    
    const recommendation = await navigationService.getBestRecommendation(
      sessionId,
      eventType,
      context
    );
    
    res.json(recommendation);
  } catch (error) {
    logger.error('Error getting recommendation:', { error: error.message });
    res.status(500).json({ error: 'Failed to get recommendation' });
  }
});

// GET /api/navigation/analytics - Get navigation analytics
router.get('/analytics', (req, res) => {
  res.json(navigationService.getAnalytics());
});

// POST /api/navigation/event-recommend - Get recommendation for specific event
router.post('/event-recommend', (req, res) => {
  try {
    const { eventType } = req.body;
    
    if (!eventType) {
      return res.status(400).json({ error: 'eventType required' });
    }
    
    const recommendation = navigationService.getEventBasedRecommendation(eventType);
    
    if (recommendation) {
      // Broadcast via WebSocket if available
      if (req.app.locals.realtimeServer) {
        req.app.locals.realtimeServer.broadcast({
          type: 'ai_navigation',
          data: recommendation,
          timestamp: Date.now()
        });
      }
      res.json(recommendation);
    } else {
      res.json({ message: 'No recommendation for this event type' });
    }
  } catch (error) {
    logger.error('Error processing event recommendation:', { error: error.message });
    res.status(500).json({ error: 'Failed to process recommendation' });
  }
});

export default router;
