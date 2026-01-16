/**
 * Zoom Control Center - API Client Only
 * Frontend UI removed - Backend-only automation system
 * 
 * This client exports the API module for external use.
 * All operations are handled via backend API and WebSocket.
 */

// Export API client for programmatic use
export * from './api/index.js';
export { default as api } from './api/index.js';

console.log('[ZCC] API Client initialized');
