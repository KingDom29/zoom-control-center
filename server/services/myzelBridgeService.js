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
   * Sendet Call-Recording zur Analyse
   */
  async analyzeCallRecording(data) {
    try {
      const response = await axios.post(`${this.baseUrl}/webhook/ticket`, {
        type: 'call_recording',
        bexio_nr: data.bexioNr,
        recording_url: data.recordingUrl,
        call_duration: data.duration,
        caller_phone: data.callerPhone,
        timestamp: new Date().toISOString()
      });
      return response.data;
    } catch (error) {
      logger.error('Myzel Call-Analyse Fehler', { error: error.message });
      return null;
    }
  }
}

export const myzelBridgeService = new MyzelBridgeService();
export default myzelBridgeService;
