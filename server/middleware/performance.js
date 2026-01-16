/**
 * Performance Monitoring Middleware
 * Tracks request metrics and provides performance insights
 */

import logger from '../utils/logger.js';

// Request metrics storage
const metrics = {
  requests: 0,
  totalDuration: 0,
  slowRequests: 0,
  errors: 0,
  byEndpoint: {},
  byMethod: { GET: 0, POST: 0, PUT: 0, DELETE: 0, PATCH: 0 },
  startTime: Date.now(),
  
  record(method, path, duration, statusCode) {
    this.requests++;
    this.totalDuration += duration;
    this.byMethod[method] = (this.byMethod[method] || 0) + 1;
    
    if (duration > 1000) this.slowRequests++;
    if (statusCode >= 400) this.errors++;
    
    // Track by endpoint (limit to prevent memory bloat)
    const endpoint = `${method} ${path.split('?')[0]}`;
    if (Object.keys(this.byEndpoint).length < 100) {
      if (!this.byEndpoint[endpoint]) {
        this.byEndpoint[endpoint] = { count: 0, totalTime: 0, avgTime: 0 };
      }
      this.byEndpoint[endpoint].count++;
      this.byEndpoint[endpoint].totalTime += duration;
      this.byEndpoint[endpoint].avgTime = 
        this.byEndpoint[endpoint].totalTime / this.byEndpoint[endpoint].count;
    }
  },
  
  getStats() {
    const uptime = Date.now() - this.startTime;
    const avgDuration = this.requests > 0 ? this.totalDuration / this.requests : 0;
    
    // Get slowest endpoints
    const slowestEndpoints = Object.entries(this.byEndpoint)
      .sort((a, b) => b[1].avgTime - a[1].avgTime)
      .slice(0, 5)
      .map(([endpoint, stats]) => ({
        endpoint,
        avgTime: Math.round(stats.avgTime),
        count: stats.count
      }));
    
    return {
      uptime: Math.round(uptime / 1000),
      totalRequests: this.requests,
      avgResponseTime: Math.round(avgDuration),
      slowRequests: this.slowRequests,
      errors: this.errors,
      errorRate: this.requests > 0 ? ((this.errors / this.requests) * 100).toFixed(2) : 0,
      requestsPerMinute: Math.round((this.requests / (uptime / 60000)) * 100) / 100,
      byMethod: this.byMethod,
      slowestEndpoints
    };
  },
  
  reset() {
    this.requests = 0;
    this.totalDuration = 0;
    this.slowRequests = 0;
    this.errors = 0;
    this.byEndpoint = {};
    this.byMethod = { GET: 0, POST: 0, PUT: 0, DELETE: 0, PATCH: 0 };
    this.startTime = Date.now();
  }
};

// Performance tracking middleware
export const performanceMiddleware = (req, res, next) => {
  const start = process.hrtime.bigint();
  
  res.on('finish', () => {
    const duration = Number(process.hrtime.bigint() - start) / 1e6; // Convert to ms
    metrics.record(req.method, req.path, duration, res.statusCode);
  });
  
  next();
};

// Get metrics endpoint handler
export const getMetrics = (req, res) => {
  res.json(metrics.getStats());
};

// Reset metrics endpoint handler
export const resetMetrics = (req, res) => {
  metrics.reset();
  res.json({ success: true, message: 'Metrics reset' });
};

// Memory usage helper
export const getMemoryUsage = () => {
  const used = process.memoryUsage();
  return {
    heapUsed: Math.round(used.heapUsed / 1024 / 1024),
    heapTotal: Math.round(used.heapTotal / 1024 / 1024),
    external: Math.round(used.external / 1024 / 1024),
    rss: Math.round(used.rss / 1024 / 1024)
  };
};

export default { performanceMiddleware, getMetrics, resetMetrics, getMemoryUsage };
