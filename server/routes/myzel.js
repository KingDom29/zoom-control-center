/**
 * Myzel Bridge API Routes
 * Verbindung zum Zendesk-Myzel-Intelligence-System
 */

import express from 'express';
import { myzelBridgeService } from '../services/myzelBridgeService.js';
import logger from '../utils/logger.js';

const router = express.Router();

// ============================================
// HEALTH & STATUS
// ============================================

router.get('/health', async (req, res) => {
  try {
    const health = await myzelBridgeService.healthCheck();
    res.json({ 
      myzel: health ? 'connected' : 'unreachable',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.json({ myzel: 'error', error: error.message });
  }
});

// ============================================
// FRAUD DETECTION
// ============================================

router.get('/fraud/:bexioNr', async (req, res) => {
  try {
    const score = await myzelBridgeService.getFraudScore(req.params.bexioNr);
    res.json(score);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/fraud-scores', async (req, res) => {
  try {
    const scores = await myzelBridgeService.getAllFraudScores();
    res.json(scores);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/check-makler/:bexioNr', async (req, res) => {
  try {
    const check = await myzelBridgeService.isMaklerSafe(req.params.bexioNr);
    res.json(check);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// MAKLER INTELLIGENCE
// ============================================

router.get('/makler/:bexioNr', async (req, res) => {
  try {
    const intel = await myzelBridgeService.getMaklerIntelligence(req.params.bexioNr);
    res.json(intel || { error: 'Makler nicht gefunden' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/safe-maklers', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const maklers = await myzelBridgeService.getSafeMaklers(limit);
    res.json({ count: maklers.length, maklers });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/risky-maklers', async (req, res) => {
  try {
    const maklers = await myzelBridgeService.getRiskyMaklers();
    res.json({ count: maklers.length, maklers });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// BILLING
// ============================================

router.get('/billing/:bexioNr', async (req, res) => {
  try {
    const billing = await myzelBridgeService.getBillingStatus(req.params.bexioNr);
    res.json(billing);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// PRE-ASSIGNMENT CHECK
// ============================================

router.get('/check-assignment/:bexioNr', async (req, res) => {
  try {
    const check = await myzelBridgeService.checkBeforeAssignment(req.params.bexioNr);
    res.json(check);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// WEBHOOKS (von Myzel empfangen)
// ============================================

router.post('/webhook/alert', async (req, res) => {
  try {
    const { type, bexio_nr, message, severity } = req.body;
    
    logger.warn('MYZEL ALERT empfangen', { type, bexio_nr, message, severity });
    
    // TODO: Hier könnte eine Aktion ausgelöst werden
    // z.B. SMS an Admin, Lead-Zuweisung stoppen, etc.
    
    res.json({ received: true, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// CALL RECORDING ANALYSIS
// ============================================

router.post('/analyze-call', async (req, res) => {
  try {
    const { bexioNr, recordingUrl, duration, callerPhone } = req.body;
    
    const result = await myzelBridgeService.analyzeCallRecording({
      bexioNr,
      recordingUrl,
      duration,
      callerPhone
    });
    
    res.json(result || { queued: true, message: 'Analyse wird durchgeführt' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
