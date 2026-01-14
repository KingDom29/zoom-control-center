import express from 'express';
import { zoomApi } from '../services/zoomAuth.js';

const router = express.Router();

// Get daily usage report
router.get('/daily', async (req, res) => {
  try {
    const { year, month } = req.query;
    const now = new Date();
    const reportYear = year || now.getFullYear();
    const reportMonth = month || now.getMonth() + 1;
    
    const report = await zoomApi('GET', `/report/daily?year=${reportYear}&month=${reportMonth}`);
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get active/inactive hosts report
router.get('/users', async (req, res) => {
  try {
    const { from, to, type = 'active' } = req.query;
    const today = new Date();
    const defaultFrom = new Date(today.setMonth(today.getMonth() - 1)).toISOString().split('T')[0];
    const defaultTo = new Date().toISOString().split('T')[0];
    
    const report = await zoomApi('GET', `/report/users?from=${from || defaultFrom}&to=${to || defaultTo}&type=${type}`);
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get meetings report
router.get('/meetings', async (req, res) => {
  try {
    const { from, to } = req.query;
    const today = new Date();
    const defaultFrom = new Date(today.setMonth(today.getMonth() - 1)).toISOString().split('T')[0];
    const defaultTo = new Date().toISOString().split('T')[0];
    
    const report = await zoomApi('GET', `/report/meetings?from=${from || defaultFrom}&to=${to || defaultTo}`);
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get meeting details report
router.get('/meetings/:meetingId', async (req, res) => {
  try {
    const report = await zoomApi('GET', `/report/meetings/${req.params.meetingId}`);
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get meeting participants report
router.get('/meetings/:meetingId/participants', async (req, res) => {
  try {
    const report = await zoomApi('GET', `/report/meetings/${req.params.meetingId}/participants`);
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get webinar details report
router.get('/webinars/:webinarId', async (req, res) => {
  try {
    const report = await zoomApi('GET', `/report/webinars/${req.params.webinarId}`);
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get cloud recording usage report
router.get('/cloud-recording', async (req, res) => {
  try {
    const { from, to } = req.query;
    const today = new Date();
    const defaultFrom = new Date(today.setMonth(today.getMonth() - 1)).toISOString().split('T')[0];
    const defaultTo = new Date().toISOString().split('T')[0];
    
    const report = await zoomApi('GET', `/report/cloud_recording?from=${from || defaultFrom}&to=${to || defaultTo}`);
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get operation logs
router.get('/operation-logs', async (req, res) => {
  try {
    const { from, to } = req.query;
    const today = new Date();
    const defaultFrom = new Date(today.setMonth(today.getMonth() - 1)).toISOString().split('T')[0];
    const defaultTo = new Date().toISOString().split('T')[0];
    
    const logs = await zoomApi('GET', `/report/operationlogs?from=${from || defaultFrom}&to=${to || defaultTo}`);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get upcoming events
router.get('/upcoming-events', async (req, res) => {
  try {
    const { from, to } = req.query;
    const today = new Date();
    const defaultFrom = today.toISOString().split('T')[0];
    const defaultTo = new Date(today.setMonth(today.getMonth() + 1)).toISOString().split('T')[0];
    
    const events = await zoomApi('GET', `/report/upcoming_events?from=${from || defaultFrom}&to=${to || defaultTo}`);
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
