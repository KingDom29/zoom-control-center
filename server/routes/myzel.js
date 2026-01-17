/**
 * Myzel Bridge API Routes
 * Verbindung zum Zendesk-Myzel-Intelligence-System
 */

import express from 'express';
import { myzelBridgeService } from '../services/myzelBridgeService.js';
import logger from '../utils/logger.js';

const router = express.Router();

// ============================================
// WEBHOOK SECRET (optional auth)
// ============================================
const MYZEL_WEBHOOK_SECRET = process.env.MYZEL_WEBHOOK_SECRET || null;

// In-memory event storage (last 100 events for dashboard/debug)
const recentEvents = [];
const MAX_EVENTS = 100;

function storeEvent(type, payload) {
  const event = {
    id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type,
    payload,
    received_at: new Date().toISOString()
  };
  recentEvents.unshift(event);
  if (recentEvents.length > MAX_EVENTS) recentEvents.pop();
  return event;
}

// Webhook auth middleware (optional - only validates if secret is set)
function validateWebhookAuth(req, res, next) {
  if (!MYZEL_WEBHOOK_SECRET) return next(); // No secret = no auth required
  
  const authHeader = req.headers['x-myzel-secret'] || req.headers['authorization'];
  if (authHeader === MYZEL_WEBHOOK_SECRET || authHeader === `Bearer ${MYZEL_WEBHOOK_SECRET}`) {
    return next();
  }
  
  logger.warn('🚫 Webhook auth failed', { ip: req.ip, path: req.path });
  return res.status(401).json({ error: 'Unauthorized', message: 'Invalid or missing X-Myzel-Secret header' });
}

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
 * Get recent webhook events (for dashboard/debug)
 */
router.get('/webhook/events', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, MAX_EVENTS);
  const type = req.query.type; // optional filter
  
  let events = recentEvents.slice(0, limit);
  if (type) events = events.filter(e => e.type === type);
  
  res.json({ 
    events, 
    total: events.length,
    auth_required: !!MYZEL_WEBHOOK_SECRET
  });
});

/**
 * Fraud Alert Webhook
 * Empfängt Alerts wenn sich Fraud-Scores ändern
 */
router.post('/webhook/alert', validateWebhookAuth, async (req, res) => {
  try {
    const { event_type, bexio_nr, severity, scores, evidence_refs, recommendation } = req.body;
    
    // Store event
    const storedEvent = storeEvent('alert', req.body);
    
    logger.warn('🚨 MYZEL FRAUD ALERT', { 
      event_id: storedEvent.id,
      event_type, 
      bexio_nr, 
      severity, 
      overall_score: scores?.overall,
      recommendation 
    });
    
    // Bei High/Critical Risk: Aktionen auslösen
    if (severity === 'high' || severity === 'critical' || (scores?.overall && scores.overall > 0.5)) {
      logger.error(`⛔ HIGH RISK MAKLER: ${bexio_nr} - Score: ${scores?.overall}`, { evidence_refs });
      // TODO: Nurturing-E-Mails stoppen
      // TODO: Task für Sales erstellen
      // TODO: Admin benachrichtigen via WebSocket
    }
    
    res.json({ 
      received: true,
      event_id: storedEvent.id,
      action_taken: (severity === 'high' || severity === 'critical') ? 'escalated' : 'logged',
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    logger.error('Webhook /alert error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * Daily Intelligence Webhook
 * Empfängt das tägliche Morning Briefing von Myzel
 */
router.post('/webhook/daily-intel', validateWebhookAuth, async (req, res) => {
  try {
    const { 
      high_priority,      // Makler die heute angerufen werden sollten
      risky_maklers,      // Neue Risiko-Einschätzungen
      billing_warnings,   // Zahlungsprobleme
      new_opportunities,  // Neue Chancen
      summary            // Zusammenfassung
    } = req.body;
    
    // Store event
    const storedEvent = storeEvent('daily-intel', req.body);
    
    logger.info('📊 DAILY INTELLIGENCE empfangen', {
      event_id: storedEvent.id,
      high_priority_count: high_priority?.length || 0,
      risky_count: risky_maklers?.length || 0,
      billing_warnings_count: billing_warnings?.length || 0,
      summary
    });
    
    // Speichere für Dashboard-Anzeige (in-memory für jetzt)
    // Das letzte daily-intel Event ist über GET /webhook/events?type=daily-intel abrufbar
    
    res.json({ 
      received: true,
      event_id: storedEvent.id,
      processed: {
        high_priority: high_priority?.length || 0,
        risky_maklers: risky_maklers?.length || 0,
        billing_warnings: billing_warnings?.length || 0
      },
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    logger.error('Webhook /daily-intel error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * Payment Status Webhook
 * Empfängt Updates wenn sich Zahlungsstatus ändert
 */
router.post('/webhook/payment', validateWebhookAuth, async (req, res) => {
  try {
    const { 
      bexio_nr, 
      event_type,        // 'payment_received', 'invoice_overdue', 'balance_low', 'balance_depleted'
      severity,
      old_balance,
      new_balance,
      leads_available,
      evidence_refs,
      recommendation,
      message 
    } = req.body;
    
    // Store event
    const storedEvent = storeEvent('payment', req.body);
    
    logger.info('💰 PAYMENT STATUS UPDATE', { 
      event_id: storedEvent.id,
      bexio_nr, 
      event_type, 
      old_balance, 
      new_balance,
      recommendation 
    });
    
    // Bei kritischen Events: Aktionen auslösen
    if (event_type === 'balance_depleted') {
      logger.warn(`⚠️ GUTHABEN AUFGEBRAUCHT: Makler ${bexio_nr}`);
      // TODO: Lead-Zuweisung blockieren
      // TODO: Erinnerungs-E-Mail senden
    }
    
    if (event_type === 'invoice_overdue') {
      logger.warn(`⚠️ RECHNUNG ÜBERFÄLLIG: Makler ${bexio_nr}`, { evidence_refs });
      // TODO: In Risiko-Liste aufnehmen
    }
    
    res.json({ 
      received: true,
      event_id: storedEvent.id,
      event_type,
      action_required: event_type === 'balance_depleted' || event_type === 'invoice_overdue',
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    logger.error('Webhook /payment error', { error: error.message });
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
