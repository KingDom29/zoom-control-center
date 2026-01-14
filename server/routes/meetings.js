import express from 'express';
import { zoomApi } from '../services/zoomAuth.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Get all meetings for all users
router.get('/', async (req, res) => {
  try {
    const { type = 'scheduled', page_size = 30 } = req.query;
    const users = await zoomApi('GET', '/users?page_size=300');
    
    const allMeetings = [];
    for (const user of users.users || []) {
      try {
        const meetings = await zoomApi('GET', `/users/${user.id}/meetings?type=${type}&page_size=${page_size}`);
        allMeetings.push(...(meetings.meetings || []).map(m => ({ ...m, host_email: user.email, host_name: `${user.first_name} ${user.last_name}` })));
      } catch (e) {
        logger.warn(`Could not fetch meetings for ${user.email}`);
      }
    }
    
    res.json({ meetings: allMeetings, total_records: allMeetings.length });
  } catch (error) {
    logger.error('Get meetings error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Get upcoming meetings
router.get('/upcoming', async (req, res) => {
  try {
    const users = await zoomApi('GET', '/users?page_size=300');
    const allMeetings = [];
    
    for (const user of users.users || []) {
      try {
        const meetings = await zoomApi('GET', `/users/${user.id}/meetings?type=upcoming&page_size=100`);
        allMeetings.push(...(meetings.meetings || []).map(m => ({ 
          ...m, 
          host_email: user.email, 
          host_name: `${user.first_name} ${user.last_name}` 
        })));
      } catch (e) {}
    }
    
    // Sort by start time
    allMeetings.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
    res.json({ meetings: allMeetings });
  } catch (error) {
    logger.error('Get upcoming meetings error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Get live meetings
router.get('/live', async (req, res) => {
  try {
    const metrics = await zoomApi('GET', '/metrics/meetings?type=live&page_size=100');
    res.json(metrics);
  } catch (error) {
    logger.error('Get live meetings error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Get meeting details
router.get('/:meetingId', async (req, res) => {
  try {
    const meeting = await zoomApi('GET', `/meetings/${req.params.meetingId}`);
    res.json(meeting);
  } catch (error) {
    logger.error('Get meeting details error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Create a new meeting
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

// Update a meeting
router.patch('/:meetingId', async (req, res) => {
  try {
    await zoomApi('PATCH', `/meetings/${req.params.meetingId}`, req.body);
    res.json({ success: true });
  } catch (error) {
    logger.error('Update meeting error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Delete a meeting
router.delete('/:meetingId', async (req, res) => {
  try {
    await zoomApi('DELETE', `/meetings/${req.params.meetingId}`);
    res.json({ success: true });
  } catch (error) {
    logger.error('Delete meeting error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// End a meeting
router.put('/:meetingId/status', async (req, res) => {
  try {
    await zoomApi('PUT', `/meetings/${req.params.meetingId}/status`, { action: 'end' });
    res.json({ success: true });
  } catch (error) {
    logger.error('End meeting error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Get meeting participants
router.get('/:meetingId/participants', async (req, res) => {
  try {
    const participants = await zoomApi('GET', `/past_meetings/${req.params.meetingId}/participants`);
    res.json(participants);
  } catch (error) {
    logger.error('Get meeting participants error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Get meeting registrants
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
