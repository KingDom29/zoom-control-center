import express from 'express';
import { zoomApi } from '../services/zoomAuth.js';

const router = express.Router();

// Get all recordings for all users
router.get('/', async (req, res) => {
  try {
    const { from, to } = req.query;
    const today = new Date();
    const defaultFrom = new Date(today.setMonth(today.getMonth() - 1)).toISOString().split('T')[0];
    const defaultTo = new Date().toISOString().split('T')[0];
    
    const users = await zoomApi('GET', '/users?page_size=300');
    const allRecordings = [];
    
    for (const user of users.users || []) {
      try {
        const recordings = await zoomApi('GET', `/users/${user.id}/recordings?from=${from || defaultFrom}&to=${to || defaultTo}`);
        if (recordings.meetings) {
          allRecordings.push(...recordings.meetings.map(r => ({
            ...r,
            host_email: user.email,
            host_name: `${user.first_name} ${user.last_name}`
          })));
        }
      } catch (e) {}
    }
    
    res.json({ meetings: allRecordings, total_records: allRecordings.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get recording details
router.get('/:meetingId', async (req, res) => {
  try {
    const recording = await zoomApi('GET', `/meetings/${req.params.meetingId}/recordings`);
    res.json(recording);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete recording
router.delete('/:meetingId', async (req, res) => {
  try {
    const { action = 'trash' } = req.query;
    await zoomApi('DELETE', `/meetings/${req.params.meetingId}/recordings?action=${action}`);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Recover recording from trash
router.put('/:meetingId/status', async (req, res) => {
  try {
    await zoomApi('PUT', `/meetings/${req.params.meetingId}/recordings/status`, { action: 'recover' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get recording settings
router.get('/settings/:userId', async (req, res) => {
  try {
    const settings = await zoomApi('GET', `/users/${req.params.userId}/settings`);
    res.json({
      recording: settings.recording,
      in_meeting: settings.in_meeting
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update recording settings
router.patch('/settings/:userId', async (req, res) => {
  try {
    await zoomApi('PATCH', `/users/${req.params.userId}/settings`, { recording: req.body });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get account recording settings
router.get('/account/settings', async (req, res) => {
  try {
    const settings = await zoomApi('GET', '/accounts/me/settings');
    res.json({
      recording: settings.recording
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
