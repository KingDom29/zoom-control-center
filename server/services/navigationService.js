/**
 * AI Navigation Service
 * Intelligent route recommendations based on user behavior and events
 */

import { openaiService } from './openaiService.js';
import logger from '../utils/logger.js';

// Navigation event storage
const navigationStore = {
  sessions: new Map(),
  globalPatterns: {},
  
  trackNavigation(sessionId, route) {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, { routes: [], startTime: Date.now() });
    }
    const session = this.sessions.get(sessionId);
    session.routes.push({ route, timestamp: Date.now() });
    
    // Track global patterns
    this.globalPatterns[route] = (this.globalPatterns[route] || 0) + 1;
    
    // Cleanup old sessions (> 24h)
    const now = Date.now();
    for (const [id, s] of this.sessions) {
      if (now - s.startTime > 86400000) this.sessions.delete(id);
    }
  },
  
  getSessionHistory(sessionId) {
    return this.sessions.get(sessionId)?.routes || [];
  },
  
  getMostVisitedRoutes(limit = 5) {
    return Object.entries(this.globalPatterns)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([route, count]) => ({ route, count }));
  }
};

// Route metadata
const ROUTE_META = {
  '/': { name: 'Dashboard', category: 'overview', priority: 1 },
  '/meetings': { name: 'Meetings', category: 'core', priority: 2 },
  '/recordings': { name: 'Aufnahmen', category: 'content', priority: 3 },
  '/reports': { name: 'Berichte', category: 'analytics', priority: 4 },
  '/users': { name: 'Benutzer', category: 'admin', priority: 5 },
  '/settings': { name: 'Einstellungen', category: 'admin', priority: 6 },
  '/webhooks': { name: 'Webhooks', category: 'dev', priority: 7 }
};

// Event to route mapping
const EVENT_ROUTE_MAP = {
  'meeting.started': '/meetings',
  'meeting.ended': '/recordings',
  'recording.completed': '/recordings',
  'user.created': '/users',
  'revenue_event': '/reports',
  'lead.converted': '/'
};

class NavigationService {
  constructor() {
    this.suggestionCache = new Map();
  }

  // Get route recommendation based on event
  getEventBasedRecommendation(eventType) {
    const route = EVENT_ROUTE_MAP[eventType];
    if (!route) return null;
    
    return {
      route,
      meta: ROUTE_META[route],
      reason: `Event: ${eventType}`,
      confidence: 0.9
    };
  }

  // Get personalized recommendation based on session history
  getPersonalizedRecommendation(sessionId) {
    const history = navigationStore.getSessionHistory(sessionId);
    if (history.length < 3) return null;
    
    // Find most visited route in session
    const routeCounts = {};
    history.forEach(h => {
      routeCounts[h.route] = (routeCounts[h.route] || 0) + 1;
    });
    
    const sorted = Object.entries(routeCounts).sort((a, b) => b[1] - a[1]);
    const mostVisited = sorted[0];
    
    // Only suggest if visited more than twice
    if (mostVisited && mostVisited[1] >= 3) {
      return {
        route: mostVisited[0],
        meta: ROUTE_META[mostVisited[0]],
        reason: 'Häufig besucht',
        confidence: 0.7
      };
    }
    
    return null;
  }

  // Get time-based recommendation
  getTimeBasedRecommendation() {
    const hour = new Date().getHours();
    
    // Morning: Dashboard overview
    if (hour >= 8 && hour < 10) {
      return {
        route: '/',
        meta: ROUTE_META['/'],
        reason: 'Morgen-Übersicht',
        confidence: 0.6
      };
    }
    
    // End of day: Reports
    if (hour >= 16 && hour < 18) {
      return {
        route: '/reports',
        meta: ROUTE_META['/reports'],
        reason: 'Tagesabschluss-Bericht',
        confidence: 0.6
      };
    }
    
    return null;
  }

  // Track navigation
  trackNavigation(sessionId, route) {
    navigationStore.trackNavigation(sessionId, route);
  }

  // Get navigation analytics
  getAnalytics() {
    return {
      activeSessions: navigationStore.sessions.size,
      mostVisitedRoutes: navigationStore.getMostVisitedRoutes(),
      routeMeta: ROUTE_META
    };
  }

  // AI-powered navigation suggestion
  async getAIRecommendation(context) {
    const cacheKey = JSON.stringify(context).substring(0, 100);
    const cached = this.suggestionCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 300000) {
      return cached.suggestion;
    }

    try {
      const prompt = `Basierend auf diesem Nutzerkontext, welche Zoom-Dashboard-Seite wäre am relevantesten?

Kontext:
- Letzte besuchte Seiten: ${context.recentRoutes?.join(', ') || 'keine'}
- Aktive Meetings: ${context.activeMeetings || 0}
- Neue Aufnahmen: ${context.newRecordings || 0}
- Uhrzeit: ${new Date().getHours()}:00

Verfügbare Seiten: Dashboard (/), Meetings (/meetings), Aufnahmen (/recordings), Berichte (/reports), Benutzer (/users), Einstellungen (/settings)

Antworte NUR mit JSON: {"route": "/...", "reason": "Kurze Begründung"}`;

      const response = await openaiService.chat(prompt);
      const parsed = JSON.parse(response);
      
      const suggestion = {
        route: parsed.route,
        meta: ROUTE_META[parsed.route],
        reason: parsed.reason,
        confidence: 0.8,
        source: 'ai'
      };
      
      this.suggestionCache.set(cacheKey, { suggestion, timestamp: Date.now() });
      return suggestion;
    } catch (error) {
      logger.warn('AI navigation recommendation failed:', { error: error.message });
      return null;
    }
  }

  // Get best recommendation (combines all sources)
  async getBestRecommendation(sessionId, eventType = null, context = {}) {
    // Priority 1: Event-based
    if (eventType) {
      const eventRec = this.getEventBasedRecommendation(eventType);
      if (eventRec) return eventRec;
    }
    
    // Priority 2: Personalized
    const personalRec = this.getPersonalizedRecommendation(sessionId);
    if (personalRec) return personalRec;
    
    // Priority 3: Time-based
    const timeRec = this.getTimeBasedRecommendation();
    if (timeRec) return timeRec;
    
    // Priority 4: AI-based (if context provided)
    if (Object.keys(context).length > 0) {
      const aiRec = await this.getAIRecommendation(context);
      if (aiRec) return aiRec;
    }
    
    // Default: Dashboard
    return {
      route: '/',
      meta: ROUTE_META['/'],
      reason: 'Standard-Startseite',
      confidence: 0.5
    };
  }
}

export const navigationService = new NavigationService();
export default navigationService;
