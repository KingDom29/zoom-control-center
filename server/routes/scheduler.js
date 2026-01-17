/**
 * Zoom Scheduler API Routes
 * Terminbuchung für Leadquelle
 */

import express from 'express';
import { zoomSchedulerService } from '../services/zoomSchedulerService.js';
import logger from '../utils/logger.js';

const router = express.Router();

// GET /api/scheduler/info - Scheduler Info abrufen
router.get('/info', async (req, res) => {
  try {
    const info = await zoomSchedulerService.getSchedulerLink();
    const pmi = await zoomSchedulerService.getPersonalMeetingRoom();
    
    res.json({
      success: true,
      scheduler: info,
      personalMeetingRoom: pmi
    });
  } catch (error) {
    logger.error('Scheduler Info Fehler', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/scheduler/create-analyse - Einzel-Analyse Meeting erstellen
router.post('/create-analyse', async (req, res) => {
  try {
    const { startTime } = req.body;
    const meeting = await zoomSchedulerService.createAnalyseMeeting({ startTime });
    
    res.status(201).json({
      success: true,
      meeting,
      bookingUrl: meeting.registrationUrl || meeting.joinUrl
    });
  } catch (error) {
    logger.error('Create Analyse Fehler', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/scheduler/create-recurring - Wiederkehrenden Slot erstellen
router.post('/create-recurring', async (req, res) => {
  try {
    const meeting = await zoomSchedulerService.createRecurringAnalyseSlot();
    
    res.status(201).json({
      success: true,
      meeting,
      message: 'Wiederkehrender Analyse-Slot erstellt (Mo-Fr)'
    });
  } catch (error) {
    logger.error('Create Recurring Fehler', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/scheduler/instant/:leadName - Sofort-Meeting für Lead
router.post('/instant/:leadName', async (req, res) => {
  try {
    const meeting = await zoomSchedulerService.createInstantMeeting(req.params.leadName);
    
    res.status(201).json({
      success: true,
      meeting,
      message: 'Instant Meeting erstellt - bereit zum Starten'
    });
  } catch (error) {
    logger.error('Instant Meeting Fehler', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/scheduler/pmi - Personal Meeting Room
router.get('/pmi', async (req, res) => {
  try {
    const pmi = await zoomSchedulerService.getPersonalMeetingRoom();
    res.json({ success: true, ...pmi });
  } catch (error) {
    logger.error('PMI Fehler', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
