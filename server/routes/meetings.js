/**
 * Zoom Meetings API Routes
 * Direkte Zoom Meeting-Verwaltung
 */

import express from 'express';
import { zoomApi } from '../services/zoomAuth.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Helper: Meetings für alle User abrufen
async function getAllUserMeetings(type = 'scheduled', pageSize = 100) {
  const users = await zoomApi('GET', '/users?page_size=300');
  const allMeetings = [];
  
  for (const user of users.users || []) {
    try {
      const meetings = await zoomApi('GET', `/users/${user.id}/meetings?type=${type}&page_size=${pageSize}`);
      allMeetings.push(...(meetings.meetings || []).map(m => ({
        ...m,
        host_email: user.email,
        host_name: `${user.first_name} ${user.last_name}`.trim()
      })));
    } catch (e) {
      // User hat keine Meetings oder kein Zugriff
    }
  }
  
  return allMeetings;
}

// GET / - Alle Meetings
router.get('/', async (req, res) => {
  try {
    const { type = 'scheduled' } = req.query;
    const meetings = await getAllUserMeetings(type);
    res.json({ meetings, total_records: meetings.length });
  } catch (error) {
    logger.error('Get meetings error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// GET /upcoming - Kommende Meetings (sortiert)
router.get('/upcoming', async (req, res) => {
  try {
    const meetings = await getAllUserMeetings('upcoming');
    meetings.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
    res.json({ meetings, total_records: meetings.length });
  } catch (error) {
    logger.error('Get upcoming meetings error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// GET /live - Aktuell laufende Meetings
router.get('/live', async (req, res) => {
  try {
    const metrics = await zoomApi('GET', '/metrics/meetings?type=live&page_size=100');
    res.json(metrics);
  } catch (error) {
    logger.error('Get live meetings error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// GET /:meetingId - Meeting Details
router.get('/:meetingId', async (req, res) => {
  try {
    const meeting = await zoomApi('GET', `/meetings/${req.params.meetingId}`);
    res.json(meeting);
  } catch (error) {
    logger.error('Get meeting details error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// POST / - Neues Meeting erstellen
router.post('/', async (req, res) => {
  try {
    const { userId = 'me', ...meetingData } = req.body;
    const meeting = await zoomApi('POST', `/users/${userId}/meetings`, meetingData);
    res.json(meeting);
  } catch (error) {
    logger.error('Create meeting error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// PATCH /:meetingId - Meeting aktualisieren
router.patch('/:meetingId', async (req, res) => {
  try {
    await zoomApi('PATCH', `/meetings/${req.params.meetingId}`, req.body);
    res.json({ success: true });
  } catch (error) {
    logger.error('Update meeting error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// DELETE /:meetingId - Meeting löschen
router.delete('/:meetingId', async (req, res) => {
  try {
    await zoomApi('DELETE', `/meetings/${req.params.meetingId}`);
    res.json({ success: true });
  } catch (error) {
    logger.error('Delete meeting error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// PUT /:meetingId/status - Meeting beenden
router.put('/:meetingId/status', async (req, res) => {
  try {
    await zoomApi('PUT', `/meetings/${req.params.meetingId}/status`, { action: 'end' });
    res.json({ success: true });
  } catch (error) {
    logger.error('End meeting error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// GET /:meetingId/participants - Teilnehmer abrufen
router.get('/:meetingId/participants', async (req, res) => {
  try {
    const participants = await zoomApi('GET', `/past_meetings/${req.params.meetingId}/participants`);
    res.json(participants);
  } catch (error) {
    logger.error('Get meeting participants error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// GET /:meetingId/registrants - Registrierungen abrufen
router.get('/:meetingId/registrants', async (req, res) => {
  try {
    const registrants = await zoomApi('GET', `/meetings/${req.params.meetingId}/registrants`);
    res.json(registrants);
  } catch (error) {
    logger.error('Get meeting registrants error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

export default router;
