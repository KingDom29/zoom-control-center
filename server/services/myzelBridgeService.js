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
   * Nutzt den neuen /check-lead-assignment Endpoint mit:
   * - Fraud Score + Call-Historie
   * - Billing Status (Bexio)
   * - External Signals (M365, etc.)
   * - Alternative Makler bei Block
   * 
   * @param {string} bexioNr - Makler Bexio-Nummer
   * @param {Object} leadData - Optional: Lead-Daten für Kontext
   */
  async checkBeforeAssignment(bexioNr, leadData = null) {
    try {
      logger.info('🔍 Check Lead Assignment', { bexioNr });

      const response = await axios.post(`${this.baseUrl}/check-lead-assignment`, {
        bexio_nr: bexioNr,
        lead_id: leadData?.id,
        lead_data: leadData ? {
          name: leadData.name,
          phone: leadData.phone,
          email: leadData.email,
          plz: leadData.plz,
          immobilie_typ: leadData.immobilieTyp
        } : null
      }, { timeout: 15000 });

      const result = response.data;

      logger.info('🔍 Assignment Check Result', {
        bexioNr,
        canAssign: result.can_assign,
        recommendation: result.recommendation,
        fraudScore: result.fraud_score,
        billingStatus: result.billing_status
      });

      return {
        bexioNr,
        canAssign: result.can_assign,
        fraudScore: result.fraud_score,
        billingStatus: result.billing_status,
        reasons: result.reasons || [],
        recommendation: result.recommendation,
        alternativeMaklers: result.alternative_maklers || [],
        checkedAt: result.checked_at,
        // Legacy-kompatible Felder
        fraud: {
          safe: result.can_assign && result.fraud_score < 0.5,
          score: result.fraud_score,
          reason: result.reasons?.find(r => r.includes('fraud') || r.includes('call')) || null
        },
        billing: {
          canReceive: result.billing_status === 'ok',
          status: result.billing_status,
          reason: result.reasons?.find(r => r.includes('billing') || r.includes('balance')) || null
        }
      };

    } catch (error) {
      logger.error('Check Assignment Fehler', { 
        bexioNr, 
        error: error.response?.data || error.message 
      });

      // Fallback auf alte Methode bei Fehler
      logger.warn('⚠️ Fallback auf lokale Checks');
      const [fraud, billing] = await Promise.all([
        this.isMaklerSafe(bexioNr),
        this.canReceiveLeads(bexioNr)
      ]);

      const canAssign = fraud.safe && billing.canReceive;

      return {
        bexioNr,
        canAssign,
        fraudScore: fraud.fraudScore / 100, // Normalize to 0-1
        billingStatus: billing.canReceive ? 'ok' : 'blocked',
        reasons: [!fraud.safe ? fraud.reason : null, !billing.canReceive ? billing.recommendation : null].filter(Boolean),
        recommendation: canAssign ? 'assign' : 'block',
        alternativeMaklers: [],
        fraud: {
          safe: fraud.safe,
          score: fraud.fraudScore,
          reason: fraud.reason
        },
        billing: {
          canReceive: billing.canReceive,
          leadsAvailable: billing.leadsAvailable,
          reason: billing.recommendation
        }
      };
    }
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

  // ============================================
  // READINESS & CALL OPTIMIZATION
  // ============================================

  /**
   * Holt Makler-Readiness Score für optimales Timing
   * @param {string} bexioNr - Makler Bexio-Nummer
   * @returns {Promise<Object>} Readiness-Daten
   */
  async getMaklerReadiness(bexioNr) {
    try {
      logger.info('📊 Hole Makler Readiness', { bexioNr });

      const response = await axios.get(`${this.baseUrl}/makler-readiness/${bexioNr}`, {
        timeout: 10000
      });

      const result = response.data;

      logger.info('📊 Makler Readiness', {
        bexioNr,
        readinessScore: result.readiness_score,
        status: result.status,
        bestTime: result.best_hours
      });

      return {
        bexioNr: result.bexio_nr,
        readinessScore: result.readiness_score,
        status: result.status, // 'ready', 'busy', 'inactive', 'blocked'
        components: {
          capacity: result.components?.capacity,
          activity: result.components?.activity,
          performance: result.components?.performance,
          trust: result.components?.trust,
          payment: result.components?.payment
        },
        openLeads: result.open_leads,
        maxCapacity: result.max_capacity,
        lastActivity: result.last_activity,
        bestDay: result.best_day,
        bestHours: result.best_hours,
        // Computed helpers
        isReady: result.status === 'ready' && result.readiness_score >= 0.6,
        shouldCall: result.status === 'ready' && result.readiness_score >= 0.7
      };

    } catch (error) {
      logger.error('Makler Readiness Fehler', { 
        bexioNr, 
        error: error.response?.data || error.message 
      });
      
      // Fallback: Assume ready if service unavailable
      return {
        bexioNr,
        readinessScore: null,
        status: 'unknown',
        components: {},
        isReady: true, // Optimistic fallback
        shouldCall: true,
        error: error.message
      };
    }
  }

  /**
   * Sendet Call-Outcome für Machine Learning
   * @param {Object} data - Outcome-Daten
   * @param {string} data.bexioNr - Makler Bexio-Nummer
   * @param {string} data.callId - Call-ID (Twilio SID oder intern)
   * @param {string} data.outcome - 'interested', 'not_interested', 'no_answer', 'callback', 'sold'
   * @param {number} data.durationSeconds - Call-Dauer
   * @param {string} data.scheduledFollowup - Optional: Nächster Termin
   * @param {string} data.notes - Optional: Notizen
   */
  async sendCallOutcome(data) {
    try {
      logger.info('📞 Sende Call Outcome', { 
        bexioNr: data.bexioNr, 
        outcome: data.outcome 
      });

      const response = await axios.post(`${this.baseUrl}/webhook/call-outcome`, {
        bexio_nr: data.bexioNr,
        call_id: data.callId,
        outcome: data.outcome,
        duration_seconds: data.durationSeconds,
        scheduled_followup: data.scheduledFollowup,
        notes: data.notes,
        timestamp: new Date().toISOString()
      }, { timeout: 10000 });

      logger.info('📞 Call Outcome gespeichert', { 
        bexioNr: data.bexioNr,
        success: response.data?.success 
      });

      return response.data;
    } catch (error) {
      logger.error('Call Outcome Fehler', { 
        bexioNr: data.bexioNr,
        error: error.response?.data || error.message 
      });
      return null;
    }
  }

  /**
   * Kombinierte Prüfung: Assignment + Readiness
   * Für den Auto-Zoom-Call Flow
   */
  async checkForAutoCall(bexioNr, leadData = null) {
    const [assignment, readiness] = await Promise.all([
      this.checkBeforeAssignment(bexioNr, leadData),
      this.getMaklerReadiness(bexioNr)
    ]);

    const canAutoCall = assignment.canAssign && readiness.shouldCall;

    return {
      bexioNr,
      canAutoCall,
      assignment: {
        canAssign: assignment.canAssign,
        fraudScore: assignment.fraudScore,
        billingStatus: assignment.billingStatus,
        recommendation: assignment.recommendation
      },
      readiness: {
        score: readiness.readinessScore,
        status: readiness.status,
        bestDay: readiness.bestDay,
        bestHours: readiness.bestHours
      },
      recommendation: canAutoCall
        ? `✅ Auto-Call möglich! Beste Zeit: ${readiness.bestDay} ${readiness.bestHours}`
        : `❌ Kein Auto-Call: ${!assignment.canAssign ? 'Assignment blocked' : 'Not ready'}`
    };
  }

  // ============================================
  // COMMUNICATION & CHILD TRACKING
  // ============================================

  /**
   * Sendet Kommunikations-Event für Multi-Channel Tracking
   * @param {Object} data - Event-Daten
   * @param {string} data.bexioNr - Makler Bexio-Nummer
   * @param {string} data.channel - 'email', 'call', 'sms', 'zoom'
   * @param {string} data.direction - 'inbound', 'outbound'
   * @param {string} data.eventType - 'sent', 'received', 'opened', 'clicked', 'completed', 'no_answer'
   * @param {string} data.subject - Optional: Bei Email
   * @param {number} data.duration - Optional: Bei Call (Sekunden)
   */
  async sendCommunicationEvent(data) {
    try {
      const response = await axios.post(`${this.baseUrl}/webhook/communication-event`, {
        bexio_nr: data.bexioNr,
        channel: data.channel,
        direction: data.direction,
        event_type: data.eventType,
        subject: data.subject,
        duration: data.duration,
        metadata: data.metadata,
        timestamp: new Date().toISOString()
      }, { timeout: 10000 });

      logger.debug('📡 Communication Event gesendet', { 
        bexioNr: data.bexioNr, 
        channel: data.channel,
        eventType: data.eventType 
      });

      return response.data;
    } catch (error) {
      logger.error('Communication Event Fehler', { error: error.message });
      return null;
    }
  }

  /**
   * Sendet Child-Zuweisung (Eigentümer → Makler)
   * @param {Object} data - Zuweisungs-Daten
   * @param {string} data.bexioNr - Makler Bexio-Nummer
   * @param {string} data.childId - Close Opportunity ID
   * @param {Object} data.childData - Eigentümer-Daten
   */
  async sendChildAssigned(data) {
    try {
      logger.info('👶 Sende Child-Zuweisung', { 
        bexioNr: data.bexioNr, 
        childId: data.childId 
      });

      const response = await axios.post(`${this.baseUrl}/webhook/child-assigned`, {
        bexio_nr: data.bexioNr,
        child_id: data.childId,
        child_data: {
          name: data.childData.name,
          phone: data.childData.phone,
          email: data.childData.email,
          plz: data.childData.plz,
          immobilie_typ: data.childData.immobilieTyp,
          wert_schaetzung: data.childData.wertSchaetzung
        },
        assigned_at: new Date().toISOString()
      }, { timeout: 10000 });

      logger.info('👶 Child-Zuweisung bestätigt', { 
        bexioNr: data.bexioNr,
        childId: data.childId 
      });

      return response.data;
    } catch (error) {
      logger.error('Child-Zuweisung Fehler', { 
        bexioNr: data.bexioNr,
        error: error.response?.data || error.message 
      });
      return null;
    }
  }

  /**
   * Sendet Child-Status Update (Verkauft, Lost, etc.)
   * @param {Object} data - Status-Daten
   * @param {string} data.bexioNr - Makler Bexio-Nummer
   * @param {string} data.childId - Close Opportunity ID
   * @param {string} data.status - 'sold', 'lost', 'expired', 'in_progress'
   * @param {number} data.salePrice - Optional: Bei sold
   * @param {string} data.lostReason - Optional: Bei lost
   * @param {number} data.daysToOutcome - Tage seit Zuweisung
   */
  async sendChildStatus(data) {
    try {
      logger.info('📊 Sende Child-Status', { 
        bexioNr: data.bexioNr, 
        childId: data.childId,
        status: data.status 
      });

      const response = await axios.post(`${this.baseUrl}/webhook/child-status`, {
        bexio_nr: data.bexioNr,
        child_id: data.childId,
        status: data.status,
        sale_price: data.salePrice,
        lost_reason: data.lostReason,
        days_to_outcome: data.daysToOutcome,
        timestamp: new Date().toISOString()
      }, { timeout: 10000 });

      logger.info('📊 Child-Status bestätigt', { 
        bexioNr: data.bexioNr,
        status: data.status,
        success: response.data?.success 
      });

      return response.data;
    } catch (error) {
      logger.error('Child-Status Fehler', { 
        bexioNr: data.bexioNr,
        error: error.response?.data || error.message 
      });
      return null;
    }
  }
}

export const myzelBridgeService = new MyzelBridgeService();
export default myzelBridgeService;
