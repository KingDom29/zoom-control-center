/**
 * Logs API Routes
 * Smart logging endpoint for frontend error tracking and AI analysis
 */

import express from 'express';
import logger from '../utils/logger.js';
import { logAnalysisService } from '../services/logAnalysisService.js';

const router = express.Router();

// In-memory log storage (replace with MongoDB in production)
const logStorage = {
  logs: [],
  maxLogs: 1000,
  errorPatterns: {},
  
  add(log) {
    this.logs.push({ ...log, id: Date.now(), receivedAt: new Date().toISOString() });
    if (this.logs.length > this.maxLogs) this.logs.shift();
    
    // Track error patterns
    if (log.level === 'error') {
      const key = log.message?.substring(0, 100) || 'unknown';
      this.errorPatterns[key] = (this.errorPatterns[key] || 0) + 1;
    }
  },
  
  getRecent(limit = 50) {
    return this.logs.slice(-limit).reverse();
  },
  
  getByLevel(level, limit = 50) {
    return this.logs.filter(l => l.level === level).slice(-limit).reverse();
  },
  
  getByCategory(category, limit = 50) {
    return this.logs.filter(l => l.category === category).slice(-limit).reverse();
  },
  
  getStats() {
    const now = Date.now();
    const last24h = this.logs.filter(l => now - new Date(l.timestamp).getTime() < 86400000);
    
    return {
      total: this.logs.length,
      last24h: last24h.length,
      errors: this.logs.filter(l => l.level === 'error').length,
      warnings: this.logs.filter(l => l.level === 'warn').length,
      byCategory: this.logs.reduce((acc, l) => {
        acc[l.category] = (acc[l.category] || 0) + 1;
        return acc;
      }, {}),
      topErrors: Object.entries(this.errorPatterns)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([message, count]) => ({ message, count }))
    };
  },
  
  clear() {
    this.logs = [];
    this.errorPatterns = {};
  }
};

// POST /api/logs - Receive frontend logs
router.post('/', async (req, res) => {
  try {
    const { level, message, category, timestamp, context } = req.body;
    
    if (!level || !message) {
      return res.status(400).json({ error: 'level and message required' });
    }
    
    const logEntry = {
      level,
      message,
      category: category || 'system',
      timestamp: timestamp || new Date().toISOString(),
      context,
      source: 'frontend',
      userAgent: req.get('User-Agent'),
      ip: req.ip
    };
    
    // Store log
    logStorage.add(logEntry);
    
    // Log to server logger
    if (level === 'error') {
      logger.error(`[FRONTEND] ${message}`, { category, context });
    } else if (level === 'warn') {
      logger.warn(`[FRONTEND] ${message}`, { category, context });
    }
    
    // Broadcast to WebSocket clients if critical
    if (['error', 'warn'].includes(level) && req.app.locals.realtimeServer) {
      req.app.locals.realtimeServer.broadcast({
        type: 'log_event',
        data: logEntry,
        timestamp: Date.now()
      });
    }
    
    res.status(200).json({ success: true, id: logEntry.id });
  } catch (error) {
    logger.error('Error processing log:', { error: error.message });
    res.status(500).json({ error: 'Failed to process log' });
  }
});

// GET /api/logs - Get recent logs
router.get('/', (req, res) => {
  const { limit = 50, level, category } = req.query;
  
  let logs;
  if (level) {
    logs = logStorage.getByLevel(level, parseInt(limit));
  } else if (category) {
    logs = logStorage.getByCategory(category, parseInt(limit));
  } else {
    logs = logStorage.getRecent(parseInt(limit));
  }
  
  res.json({ logs, total: logs.length });
});

// GET /api/logs/stats - Get log statistics
router.get('/stats', (req, res) => {
  res.json(logStorage.getStats());
});

// GET /api/logs/health - Get system health based on logs
router.get('/health', (req, res) => {
  const stats = logStorage.getStats();
  const now = Date.now();
  const recentLogs = logStorage.logs.filter(l => now - new Date(l.timestamp).getTime() < 3600000);
  
  const errorsLastHour = recentLogs.filter(l => l.level === 'error').length;
  const warningsLastHour = recentLogs.filter(l => l.level === 'warn').length;
  
  // Calculate stability score
  let stabilityScore = 100;
  stabilityScore -= Math.min(errorsLastHour * 5, 50);
  stabilityScore -= Math.min(warningsLastHour * 2, 25);
  
  const status = stabilityScore >= 90 ? 'healthy' : 
                 stabilityScore >= 70 ? 'stable' :
                 stabilityScore >= 50 ? 'degraded' : 'critical';
  
  res.json({
    stabilityScore: Math.max(stabilityScore, 0),
    status,
    errorsLastHour,
    warningsLastHour,
    totalLogs: stats.total,
    topErrors: stats.topErrors
  });
});

// POST /api/logs/analyze - AI analysis of error logs
router.post('/analyze', async (req, res) => {
  try {
    const { logId, message } = req.body;
    
    const targetMessage = message || logStorage.logs.find(l => l.id === logId)?.message;
    
    if (!targetMessage) {
      return res.status(400).json({ error: 'Log message required' });
    }
    
    const analysis = await logAnalysisService.analyzeError(targetMessage);
    
    res.json({
      message: targetMessage,
      analysis,
      analyzedAt: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error analyzing log:', { error: error.message });
    res.status(500).json({ error: 'Analysis failed' });
  }
});

// DELETE /api/logs - Clear all logs
router.delete('/', (req, res) => {
  logStorage.clear();
  res.json({ success: true, message: 'Logs cleared' });
});

export default router;
