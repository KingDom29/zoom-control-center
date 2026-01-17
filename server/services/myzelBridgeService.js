/**
 * Myzel Bridge Service
 * Integration mit dem Zendesk-Myzel-Intelligence-System
 * Fraud-Detection, Billing Intelligence, Makler-Scoring
 */

import axios from 'axios';
import logger from '../utils/logger.js';

const MYZEL_BASE_URL = process.env.MYZEL_API_URL || 'https://zendesk-myzel.up.railway.app/api/bridge';

class MyzelBridgeService {
  constructor() {
    this.baseUrl = MYZEL_BASE_URL;
  }

  async request(endpoint) {
    try {
      const response = await axios.get(`${this.baseUrl}${endpoint}`, {
        timeout: 10000
      });
      return response.data;
    } catch (error) {
      logger.error('Myzel Bridge Fehler', { 
        endpoint, 
        error: error.response?.data || error.message 
      });
      return null;
    }
  }

  // ============================================
  // HEALTH & STATUS
  // ============================================

  async healthCheck() {
    return this.request('/health');
  }

  // ============================================
  // FRAUD DETECTION
  // ============================================

  /**
   * Fraud-Score für einen Makler abrufen
   */
  async getFraudScore(bexioNr) {
    const data = await this.request(`/fraud/${bexioNr}`);
    return data || { 
      bexio_nr: bexioNr, 
      risk_assessment: 'unknown',
      fraud_score: 50,
      recommendation: 'Makler nicht im System - manuelle Prüfung empfohlen'
    };
  }

  /**
   * Alle Fraud-Scores abrufen
   */
  async getAllFraudScores() {
    return this.request('/fraud-scores') || { scores: [] };
  }

  /**
   * Prüft ob ein Makler sicher ist für Lead-Zuweisung
   */
  async isMaklerSafe(bexioNr) {
    const fraud = await this.getFraudScore(bexioNr);
    
    if (!fraud) return { safe: false, reason: 'Myzel nicht erreichbar' };
    
    const isSafe = fraud.risk_assessment === 'safe' || fraud.fraud_score < 30;
    
    return {
      safe: isSafe,
      fraudScore: fraud.fraud_score,
      riskAssessment: fraud.risk_assessment,
      reason: isSafe 
        ? `Makler ist sicher (Score: ${fraud.fraud_score})` 
        : `WARNUNG: Risiko-Makler! ${fraud.recommendation}`
    };
  }

  // ============================================
  // MAKLER INTELLIGENCE
  // ============================================

  /**
   * Vollständige Makler-Intelligence abrufen
   */
  async getMaklerIntelligence(bexioNr) {
    return this.request(`/makler/${bexioNr}`);
  }

  /**
   * Liste sicherer Makler (für Lead-Zuweisung)
   */
  async getSafeMaklers(limit = 50) {
    const data = await this.request('/safe-maklers');
    if (!data?.maklers) return [];
    return data.maklers.slice(0, limit);
  }

  /**
   * Liste risikobehafteter Makler (WARNUNG!)
   */
  async getRiskyMaklers() {
    const data = await this.request('/risky-maklers');
    return data?.maklers || [];
  }

  // ============================================
  // BILLING INTELLIGENCE
  // ============================================

  /**
   * Billing-Status eines Maklers
   */
  async getBillingStatus(bexioNr) {
    const data = await this.request(`/billing/${bexioNr}`);
    return data || {
      bexio_nr: bexioNr,
      balance: { current: 0, leads_available: 0 },
      can_receive_leads: false,
      recommendation: 'Unbekannt'
    };
  }

  /**
   * Prüft ob Makler Leads empfangen kann (Guthaben vorhanden)
   */
  async canReceiveLeads(bexioNr) {
    const billing = await this.getBillingStatus(bexioNr);
    return {
      canReceive: billing.can_receive_leads,
      leadsAvailable: billing.balance?.leads_available || 0,
      recommendation: billing.recommendation
    };
  }

  // ============================================
  // INTEGRATION HELPERS
  // ============================================

  /**
   * Vollständige Prüfung vor Lead-Zuweisung
   * Kombiniert Fraud-Check + Billing-Check
   */
  async checkBeforeAssignment(bexioNr) {
    const [fraud, billing] = await Promise.all([
      this.isMaklerSafe(bexioNr),
      this.canReceiveLeads(bexioNr)
    ]);

    const canAssign = fraud.safe && billing.canReceive;

    return {
      bexioNr,
      canAssign,
      fraud: {
        safe: fraud.safe,
        score: fraud.fraudScore,
        reason: fraud.reason
      },
      billing: {
        canReceive: billing.canReceive,
        leadsAvailable: billing.leadsAvailable,
        reason: billing.recommendation
      },
      recommendation: canAssign 
        ? `✅ Lead kann zugewiesen werden (${billing.leadsAvailable} verfügbar)`
        : `❌ BLOCKED: ${!fraud.safe ? fraud.reason : billing.recommendation}`
    };
  }

  /**
   * Sendet Call-Recording mit Transkript zur Deception-Analyse
   * @param {Object} data - Call-Daten
   * @param {string} data.bexioNr - Makler Bexio-Nummer
   * @param {string} data.callId - Twilio Call SID
   * @param {string} data.transcript - Whisper-Transkript
   * @param {number} data.durationSeconds - Call-Dauer in Sekunden
   * @param {string} data.direction - 'inbound' oder 'outbound'
   * @param {string} data.callerName - Name des Anrufers (optional)
   * @param {string} data.calleeName - Name des Angerufenen (optional)
   * @param {string} data.callTimestamp - Zeitpunkt des Calls
   */
  async analyzeCallRecording(data) {
    try {
      logger.info('📞 Sende Call zur Deception-Analyse', { 
        bexioNr: data.bexioNr, 
        callId: data.callId,
        transcriptLength: data.transcript?.length 
      });

      const response = await axios.post(`${this.baseUrl}/analyze-call`, {
        bexio_nr: data.bexioNr,
        call_id: data.callId,
        transcript: data.transcript,
        duration_seconds: data.durationSeconds,
        direction: data.direction || 'outbound',
        caller_name: data.callerName,
        callee_name: data.calleeName,
        call_timestamp: data.callTimestamp || new Date().toISOString()
      }, { timeout: 30000 });

      logger.info('📞 Call-Analyse Ergebnis', { 
        callId: data.callId,
        deceptionScore: response.data?.deception_score,
        riskLevel: response.data?.risk_level
      });

      return response.data;
    } catch (error) {
      logger.error('Myzel Call-Analyse Fehler', { 
        callId: data.callId,
        error: error.response?.data || error.message 
      });
      return null;
    }
  }

  /**
   * Sendet externes Signal an Zendesk Renew (z.B. M365 Anomalie)
   * @param {Object} data - Signal-Daten
   * @param {string} data.bexioNr - Betroffener Makler
   * @param {string} data.source - Quelle ('m365', 'zendesk', 'twilio')
   * @param {Object} data.context - Kontext-Daten
   * @param {string} data.severity - Schweregrad
   */
  async sendExternalSignal(data) {
    try {
      logger.info('📡 Sende externes Signal an Renew', { 
        bexioNr: data.bexioNr, 
        source: data.source 
      });

      const response = await axios.post(`${this.baseUrl}/webhook/external-signal`, {
        bexio_nr: data.bexioNr,
        source: data.source,
        context: data.context,
        severity: data.severity || 'info',
        timestamp: new Date().toISOString()
      }, { timeout: 10000 });

      return response.data;
    } catch (error) {
      logger.error('External Signal Fehler', { error: error.message });
      return null;
    }
  }
}

export const myzelBridgeService = new MyzelBridgeService();
export default myzelBridgeService;
