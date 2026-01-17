/**
 * Lead Routes - Main Router
 * Combines CRUD and Outreach sub-routers
 */

import express from 'express';
import crudRouter from './crud.js';
import outreachRouter from './outreach.js';

const router = express.Router();

// Mount sub-routers
// Outreach routes first (more specific paths)
router.use('/outreach', outreachRouter);

// Legacy endpoint mappings (für Rückwärtskompatibilität)
router.post('/generate', (req, res, next) => { req.url = '/outreach/generate'; next(); });
router.get('/queue-status', (req, res, next) => { req.url = '/outreach/queue-status'; next(); });
router.post('/process-next-district', (req, res, next) => { req.url = '/outreach/process-next-district'; next(); });
router.post('/process-queue', (req, res, next) => { req.url = '/outreach/process-queue'; next(); });
router.post('/reset-queue', (req, res, next) => { req.url = '/outreach/reset-queue'; next(); });
router.post('/process-outreach', (req, res, next) => { req.url = '/outreach/process'; next(); });
router.get('/outreach-stats', (req, res, next) => { req.url = '/outreach/stats'; next(); });
router.get('/track/:action/:token', (req, res, next) => { req.url = `/outreach/track/${req.params.action}/${req.params.token}`; next(); });

// Re-route legacy endpoints through outreach router
router.use('/', outreachRouter);

// CRUD routes (base paths)
router.use('/', crudRouter);

export default router;
