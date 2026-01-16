/**
 * Log Analysis Service
 * AI-powered error analysis and diagnosis
 */

import { openaiService } from './openaiService.js';
import logger from '../utils/logger.js';

// Error pattern database
const ERROR_PATTERNS = {
  'ECONNREFUSED': {
    category: 'network',
    cause: 'Verbindung zum Server verweigert',
    solution: 'Überprüfen Sie, ob der Zielserver läuft und erreichbar ist'
  },
  'ETIMEDOUT': {
    category: 'network',
    cause: 'Verbindungs-Timeout',
    solution: 'Netzwerkverbindung überprüfen oder Timeout-Werte erhöhen'
  },
  'ENOTFOUND': {
    category: 'network',
    cause: 'DNS-Auflösung fehlgeschlagen',
    solution: 'DNS-Einstellungen und Hostname überprüfen'
  },
  '401': {
    category: 'auth',
    cause: 'Authentifizierung fehlgeschlagen',
    solution: 'API-Schlüssel oder Token überprüfen und ggf. erneuern'
  },
  '403': {
    category: 'auth',
    cause: 'Zugriff verweigert',
    solution: 'Berechtigungen des Accounts überprüfen'
  },
  '404': {
    category: 'api',
    cause: 'Ressource nicht gefunden',
    solution: 'API-Endpoint oder Ressourcen-ID überprüfen'
  },
  '429': {
    category: 'rate_limit',
    cause: 'Rate Limit überschritten',
    solution: 'Anfragerate reduzieren oder Rate Limit erhöhen lassen'
  },
  '500': {
    category: 'server',
    cause: 'Interner Serverfehler',
    solution: 'Server-Logs überprüfen, Backend-Team kontaktieren'
  },
  'TypeError': {
    category: 'code',
    cause: 'Typfehler im Code',
    solution: 'Variablentypen überprüfen, null/undefined-Checks hinzufügen'
  },
  'ReferenceError': {
    category: 'code',
    cause: 'Referenzfehler - Variable nicht definiert',
    solution: 'Variable vor Verwendung deklarieren'
  },
  'SyntaxError': {
    category: 'code',
    cause: 'Syntaxfehler im Code',
    solution: 'Code-Syntax überprüfen, Linter verwenden'
  }
};

// Severity levels
const SEVERITY_KEYWORDS = {
  critical: ['crash', 'fatal', 'critical', 'emergency', 'data loss', 'security'],
  high: ['error', 'failed', 'exception', 'unauthorized', 'forbidden'],
  medium: ['warning', 'timeout', 'retry', 'deprecated'],
  low: ['info', 'notice', 'debug']
};

class LogAnalysisService {
  constructor() {
    this.analysisCache = new Map();
    this.cacheMaxAge = 300000; // 5 minutes
  }

  // Pattern-based analysis (fast, no AI)
  analyzePattern(message) {
    const msgLower = message.toLowerCase();
    
    for (const [pattern, info] of Object.entries(ERROR_PATTERNS)) {
      if (message.includes(pattern) || msgLower.includes(pattern.toLowerCase())) {
        return {
          matched: true,
          pattern,
          ...info
        };
      }
    }
    
    return { matched: false };
  }

  // Determine severity
  determineSeverity(message) {
    const msgLower = message.toLowerCase();
    
    for (const [severity, keywords] of Object.entries(SEVERITY_KEYWORDS)) {
      if (keywords.some(kw => msgLower.includes(kw))) {
        return severity;
      }
    }
    
    return 'medium';
  }

  // AI-powered analysis
  async analyzeError(message) {
    // Check cache first
    const cacheKey = message.substring(0, 100);
    const cached = this.analysisCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheMaxAge) {
      return cached.analysis;
    }

    // Pattern-based analysis first
    const patternAnalysis = this.analyzePattern(message);
    const severity = this.determineSeverity(message);

    // If pattern matched, return quick analysis
    if (patternAnalysis.matched) {
      const analysis = {
        severity,
        category: patternAnalysis.category,
        cause: patternAnalysis.cause,
        solution: patternAnalysis.solution,
        confidence: 0.9,
        source: 'pattern'
      };
      
      this.analysisCache.set(cacheKey, { analysis, timestamp: Date.now() });
      return analysis;
    }

    // AI analysis for unknown patterns
    try {
      const aiAnalysis = await this.getAIAnalysis(message);
      
      const analysis = {
        severity,
        ...aiAnalysis,
        confidence: 0.7,
        source: 'ai'
      };
      
      this.analysisCache.set(cacheKey, { analysis, timestamp: Date.now() });
      return analysis;
    } catch (error) {
      logger.warn('AI analysis failed, using fallback:', { error: error.message });
      
      return {
        severity,
        category: 'unknown',
        cause: 'Unbekannter Fehler',
        solution: 'Fehlerlog manuell analysieren oder Support kontaktieren',
        confidence: 0.3,
        source: 'fallback'
      };
    }
  }

  // Get AI analysis from OpenAI
  async getAIAnalysis(message) {
    const prompt = `Analysiere diesen Fehlerlog kurz und präzise (max 2 Sätze pro Feld):

Fehler: "${message}"

Antworte im JSON-Format:
{
  "category": "network|auth|api|code|server|config|unknown",
  "cause": "Kurze Beschreibung der wahrscheinlichen Ursache",
  "solution": "Konkrete Handlungsempfehlung"
}`;

    try {
      const response = await openaiService.chat(prompt);
      const parsed = JSON.parse(response);
      return {
        category: parsed.category || 'unknown',
        cause: parsed.cause || 'Unbekannte Ursache',
        solution: parsed.solution || 'Keine spezifische Lösung verfügbar'
      };
    } catch {
      throw new Error('AI parsing failed');
    }
  }

  // Analyze multiple logs for patterns
  analyzeLogBatch(logs) {
    const categories = {};
    const severities = {};
    const patterns = [];

    logs.forEach(log => {
      const analysis = this.analyzePattern(log.message || '');
      const severity = this.determineSeverity(log.message || '');
      
      severities[severity] = (severities[severity] || 0) + 1;
      
      if (analysis.matched) {
        categories[analysis.category] = (categories[analysis.category] || 0) + 1;
        patterns.push({ message: log.message, pattern: analysis.pattern });
      }
    });

    return {
      totalLogs: logs.length,
      bySeverity: severities,
      byCategory: categories,
      detectedPatterns: patterns.slice(0, 10)
    };
  }

  // Clear cache
  clearCache() {
    this.analysisCache.clear();
  }
}

export const logAnalysisService = new LogAnalysisService();
export default logAnalysisService;
