/**
 * Sales Automation API Routes
 */

import express from 'express';
import { salesAutomationService } from '../services/salesAutomationService.js';
import { zendeskService } from '../services/zendeskService.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Stats
router.get('/stats', (req, res) => {
  const stats = salesAutomationService.getStats();
  res.json(stats);
});

// No-Show Reschedule manuell triggern
router.post('/process-no-shows', async (req, res) => {
  try {
    const result = await salesAutomationService.processNoShows();
    res.json(result);
  } catch (error) {
    logger.error('No-Show Processing Fehler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Warm-Ups manuell triggern
router.post('/process-warmups', async (req, res) => {
  try {
    const result = await salesAutomationService.processPreMeetingWarmUps();
    res.json(result);
  } catch (error) {
    logger.error('Warm-Up Fehler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Deal-Closer Sequenz starten
router.post('/deal-closer/start', async (req, res) => {
  try {
    const { contact, meetingInfo } = req.body;
    if (!contact || !contact.email) {
      return res.status(400).json({ error: 'contact.email required' });
    }
    const result = await salesAutomationService.startDealCloserSequence(contact, meetingInfo);
    res.json(result);
  } catch (error) {
    logger.error('Deal-Closer Start Fehler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Deal-Closer Sequenzen verarbeiten
router.post('/deal-closer/process', async (req, res) => {
  try {
    const result = await salesAutomationService.processDealCloserSequences();
    res.json(result);
  } catch (error) {
    logger.error('Deal-Closer Process Fehler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Meeting-Kette erstellen
router.post('/meeting-chain', async (req, res) => {
  try {
    const { contact, chainType } = req.body;
    if (!contact || !contact.email) {
      return res.status(400).json({ error: 'contact.email required' });
    }
    const result = await salesAutomationService.createMeetingChain(contact, chainType);
    res.json(result);
  } catch (error) {
    logger.error('Meeting-Chain Fehler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Auto-Booking Link erstellen
router.post('/booking-link', async (req, res) => {
  try {
    const { hostId, topic, duration } = req.body;
    if (!hostId) {
      return res.status(400).json({ error: 'hostId required' });
    }
    const result = await salesAutomationService.createAutoBookingLink(hostId, { topic, duration });
    res.json(result);
  } catch (error) {
    logger.error('Booking-Link Fehler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// KUNDENAKTIVITÄTS-TRACKING (ZENDESK)
// ============================================

// Echte Kundenaktivität abrufen
router.get('/customer-activity/:email', async (req, res) => {
  try {
    const { days } = req.query;
    const result = await zendeskService.getRealCustomerActivity(
      req.params.email, 
      parseInt(days) || 30
    );
    res.json(result);
  } catch (error) {
    logger.error('Customer Activity Fehler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Inaktive Kunden finden
router.post('/inactive-customers', async (req, res) => {
  try {
    const { emails, days } = req.body;
    if (!emails || !Array.isArray(emails)) {
      return res.status(400).json({ error: 'emails array required' });
    }
    const result = await zendeskService.findInactiveCustomers(emails, days || 30);
    res.json(result);
  } catch (error) {
    logger.error('Inactive Customers Fehler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

export default router;
