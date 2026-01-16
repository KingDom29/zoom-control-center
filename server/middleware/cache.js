/**
 * Response Cache Middleware
 * In-memory caching for frequently accessed endpoints
 */

import NodeCache from 'node-cache';

// Cache instances with different TTLs
const shortCache = new NodeCache({ stdTTL: 30, checkperiod: 60 });   // 30s
const mediumCache = new NodeCache({ stdTTL: 300, checkperiod: 120 }); // 5min
const longCache = new NodeCache({ stdTTL: 3600, checkperiod: 300 });  // 1h

// Cache config per endpoint pattern
const CACHE_CONFIG = {
  '/api/health': { cache: shortCache, ttl: 30 },
  '/api/metrics': { cache: shortCache, ttl: 10 },
  '/api/dashboard/overview': { cache: shortCache, ttl: 30 },
  '/api/dashboard/quick-stats': { cache: shortCache, ttl: 30 },
  '/api/users': { cache: mediumCache, ttl: 300 },
  '/api/settings/account': { cache: mediumCache, ttl: 300 },
  '/api/webhooks/event-types': { cache: longCache, ttl: 3600 },
  '/api/revenue/event-types': { cache: longCache, ttl: 3600 },
  '/api/logs/stats': { cache: shortCache, ttl: 60 },
  '/api/navigation/analytics': { cache: shortCache, ttl: 60 }
};

// Generate cache key from request
const getCacheKey = (req) => `${req.method}:${req.originalUrl}`;

// Find matching cache config
const findCacheConfig = (path) => {
  for (const [pattern, config] of Object.entries(CACHE_CONFIG)) {
    if (path.startsWith(pattern)) return config;
  }
  return null;
};

/**
 * Cache middleware - only caches GET requests
 */
export const cacheMiddleware = (req, res, next) => {
  if (req.method !== 'GET') return next();
  
  const config = findCacheConfig(req.path);
  if (!config) return next();
  
  const key = getCacheKey(req);
  const cached = config.cache.get(key);
  
  if (cached) {
    res.set('X-Cache', 'HIT');
    return res.json(cached);
  }
  
  // Store original json method
  const originalJson = res.json.bind(res);
  
  res.json = (data) => {
    config.cache.set(key, data, config.ttl);
    res.set('X-Cache', 'MISS');
    return originalJson(data);
  };
  
  next();
};

/**
 * Clear cache for specific patterns
 */
export const clearCache = (pattern) => {
  [shortCache, mediumCache, longCache].forEach(cache => {
    const keys = cache.keys();
    keys.filter(k => k.includes(pattern)).forEach(k => cache.del(k));
  });
};

/**
 * Get cache stats
 */
export const getCacheStats = () => ({
  short: shortCache.getStats(),
  medium: mediumCache.getStats(),
  long: longCache.getStats()
});

export default { cacheMiddleware, clearCache, getCacheStats };
