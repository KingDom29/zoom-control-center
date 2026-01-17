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

/**
 * Fraud Alert Webhook
 * Empfängt Alerts wenn sich Fraud-Scores ändern
 */
router.post('/webhook/alert', async (req, res) => {
  try {
    const { type, bexio_nr, message, severity, old_score, new_score } = req.body;
    
    logger.warn('🚨 MYZEL FRAUD ALERT', { type, bexio_nr, message, severity, old_score, new_score });
    
    // Bei High Risk: Aktionen auslösen
    if (severity === 'high' || new_score > 50) {
      logger.error(`⛔ HIGH RISK MAKLER: ${bexio_nr} - Score: ${new_score}`);
      // TODO: Nurturing-E-Mails stoppen
      // TODO: Task für Sales erstellen
      // TODO: Admin benachrichtigen
    }
    
    res.json({ 
      received: true, 
      action_taken: severity === 'high' ? 'escalated' : 'logged',
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Daily Intelligence Webhook
 * Empfängt das tägliche Morning Briefing von Myzel
 */
router.post('/webhook/daily-intel', async (req, res) => {
  try {
    const { 
      high_priority,      // Makler die heute angerufen werden sollten
      risky_maklers,      // Neue Risiko-Einschätzungen
      billing_warnings,   // Zahlungsprobleme
      new_opportunities,  // Neue Chancen
      summary            // Zusammenfassung
    } = req.body;
    
    logger.info('📊 DAILY INTELLIGENCE empfangen', {
      high_priority_count: high_priority?.length || 0,
      risky_count: risky_maklers?.length || 0,
      billing_warnings_count: billing_warnings?.length || 0
    });
    
    // Speichere für Dashboard-Anzeige
    // TODO: In DB speichern für Morning Brief Widget
    
    res.json({ 
      received: true,
      processed: {
        high_priority: high_priority?.length || 0,
        risky_maklers: risky_maklers?.length || 0,
        billing_warnings: billing_warnings?.length || 0
      },
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Payment Status Webhook
 * Empfängt Updates wenn sich Zahlungsstatus ändert
 */
router.post('/webhook/payment', async (req, res) => {
  try {
    const { 
      bexio_nr, 
      event_type,        // 'payment_received', 'invoice_overdue', 'balance_low', 'balance_depleted'
      old_balance,
      new_balance,
      leads_available,
      message 
    } = req.body;
    
    logger.info('💰 PAYMENT STATUS UPDATE', { bexio_nr, event_type, old_balance, new_balance });
    
    // Bei kritischen Events: Aktionen auslösen
    if (event_type === 'balance_depleted') {
      logger.warn(`⚠️ GUTHABEN AUFGEBRAUCHT: Makler ${bexio_nr}`);
      // TODO: Lead-Zuweisung blockieren
      // TODO: Erinnerungs-E-Mail senden
    }
    
    if (event_type === 'invoice_overdue') {
      logger.warn(`⚠️ RECHNUNG ÜBERFÄLLIG: Makler ${bexio_nr}`);
      // TODO: In Risiko-Liste aufnehmen
    }
    
    res.json({ 
      received: true, 
      event_type,
      action_required: event_type === 'balance_depleted' || event_type === 'invoice_overdue',
      timestamp: new Date().toISOString() 
    });
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
