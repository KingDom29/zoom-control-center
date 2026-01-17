/**
 * Meeting Summary API Routes
 */

import express from 'express';
import { meetingSummaryService } from '../services/meetingSummaryService.js';
import logger from '../utils/logger.js';

const router = express.Router();

// POST /api/summaries/process/:meetingId - Manuell Recording verarbeiten
router.post('/process/:meetingId', async (req, res) => {
  try {
    const result = await meetingSummaryService.processManual(req.params.meetingId);
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('Summary Processing Fehler', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/summaries/status - Service Status
router.get('/status', (req, res) => {
  res.json({
    success: true,
    openaiEnabled: !!process.env.OPENAI_API_KEY,
    summaryEmail: process.env.SUMMARY_EMAIL || 'de@leadquelle.ai'
  });
});

export default router;
