import express from 'express';
import { zoomApi } from '../services/zoomAuth.js';
import { teamActivityService } from '../services/teamActivityService.js';
import { meetingQualityService } from '../services/meetingQualityService.js';
import logger from '../utils/logger.js';

const router = express.Router();

// ============================================
// MEETING QUALITY & PRODUCTIVITY
// ============================================

// Meeting-Qualitäts-Score für User
router.get('/:userId/quality', async (req, res) => {
  try {
    const { from, to } = req.query;
    const result = await meetingQualityService.getUserMeetingsWithScore(req.params.userId, from, to);
    res.json(result);
  } catch (error) {
    logger.error('Quality Score Fehler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// No-Show Check
router.get('/team/no-shows', async (req, res) => {
  try {
    const result = await meetingQualityService.checkNoShows();
    res.json(result);
  } catch (error) {
    logger.error('No-Show Check Fehler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Inaktive User abrufen
router.get('/team/inactive', async (req, res) => {
  try {
    const result = await meetingQualityService.getInactiveUsers();
    res.json(result);
  } catch (error) {
    logger.error('Inactive Users Fehler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Produktivitäts-Report senden
router.post('/team/productivity/send', async (req, res) => {
  try {
    const result = await meetingQualityService.sendProductivityReport();
    res.json(result);
  } catch (error) {
    logger.error('Productivity Report Fehler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Reminder an alle inaktiven User senden
router.post('/team/reminders/send', async (req, res) => {
  try {
    const result = await meetingQualityService.sendAllInactivityReminders();
    res.json(result);
  } catch (error) {
    logger.error('Reminders Fehler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// TEAM MANAGEMENT ROUTES
// ============================================

// Team-Übersicht mit allen Details
router.get('/team/overview', async (req, res) => {
  try {
    const overview = await teamActivityService.getTeamOverview();
    res.json(overview);
  } catch (error) {
    logger.error('Team Overview Fehler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Team-Report generieren
router.get('/team/report/:period', async (req, res) => {
  try {
    const { period } = req.params; // day, week, month
    const report = await teamActivityService.generateTeamReport(period);
    res.json(report);
  } catch (error) {
    logger.error('Team Report Fehler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Team-Report per E-Mail senden
router.post('/team/report/:period/send', async (req, res) => {
  try {
    const { period } = req.params;
    const result = await teamActivityService.sendTeamReportEmail(period);
    res.json(result);
  } catch (error) {
    logger.error('Team Report Send Fehler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// User-Aktivität abrufen
router.get('/:userId/activity', async (req, res) => {
  try {
    const { from, to } = req.query;
    const activity = await teamActivityService.getUserActivity(req.params.userId, from, to);
    res.json(activity);
  } catch (error) {
    logger.error('User Activity Fehler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Zoom Rooms abrufen
router.get('/rooms/list', async (req, res) => {
  try {
    const rooms = await teamActivityService.getRooms();
    res.json(rooms);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Zoom Phone Users abrufen
router.get('/phone/list', async (req, res) => {
  try {
    const phoneUsers = await teamActivityService.getPhoneUsers();
    res.json(phoneUsers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Phone zu User zuweisen
router.post('/:userId/phone', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    const result = await teamActivityService.assignPhoneToUser(req.params.userId, phoneNumber);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Room zu User zuweisen
router.post('/:userId/room', async (req, res) => {
  try {
    const { roomId } = req.body;
    const result = await teamActivityService.assignRoomToUser(req.params.userId, roomId);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// STANDARD USER ROUTES
// ============================================

// Get all users
router.get('/', async (req, res) => {
  try {
    const { status = 'active', page_size = 300 } = req.query;
    const users = await zoomApi('GET', `/users?status=${status}&page_size=${page_size}`);
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user details
router.get('/:userId', async (req, res) => {
  try {
    const user = await zoomApi('GET', `/users/${req.params.userId}`);
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user settings
router.get('/:userId/settings', async (req, res) => {
  try {
    const settings = await zoomApi('GET', `/users/${req.params.userId}/settings`);
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update user settings
router.patch('/:userId/settings', async (req, res) => {
  try {
    await zoomApi('PATCH', `/users/${req.params.userId}/settings`, req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create a new user
router.post('/', async (req, res) => {
  try {
    const user = await zoomApi('POST', '/users', req.body);
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update user
router.patch('/:userId', async (req, res) => {
  try {
    await zoomApi('PATCH', `/users/${req.params.userId}`, req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete user
router.delete('/:userId', async (req, res) => {
  try {
    const { action = 'disassociate' } = req.query;
    await zoomApi('DELETE', `/users/${req.params.userId}?action=${action}`);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user's meetings
router.get('/:userId/meetings', async (req, res) => {
  try {
    const { type = 'scheduled' } = req.query;
    const meetings = await zoomApi('GET', `/users/${req.params.userId}/meetings?type=${type}`);
    res.json(meetings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user's recordings
router.get('/:userId/recordings', async (req, res) => {
  try {
    const { from, to } = req.query;
    let endpoint = `/users/${req.params.userId}/recordings`;
    if (from && to) {
      endpoint += `?from=${from}&to=${to}`;
    }
    const recordings = await zoomApi('GET', endpoint);
    res.json(recordings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update user status (activate/deactivate)
router.put('/:userId/status', async (req, res) => {
  try {
    await zoomApi('PUT', `/users/${req.params.userId}/status`, req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user permissions
router.get('/:userId/permissions', async (req, res) => {
  try {
    const permissions = await zoomApi('GET', `/users/${req.params.userId}/permissions`);
    res.json(permissions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
