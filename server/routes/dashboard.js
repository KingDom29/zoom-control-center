import express from 'express';
import { zoomApi } from '../services/zoomAuth.js';

const router = express.Router();

// Get dashboard overview data
router.get('/overview', async (req, res) => {
  try {
    const [users, accountInfo] = await Promise.all([
      zoomApi('GET', '/users?page_size=300'),
      zoomApi('GET', '/accounts/me').catch(() => null)
    ]);
    
    // Get meetings count
    let totalMeetings = 0;
    let upcomingMeetings = 0;
    
    for (const user of (users.users || []).slice(0, 10)) {
      try {
        const meetings = await zoomApi('GET', `/users/${user.id}/meetings?type=upcoming&page_size=100`);
        upcomingMeetings += meetings.total_records || 0;
      } catch (e) {}
    }
    
    // Get live meetings
    let liveMeetings = [];
    try {
      const liveData = await zoomApi('GET', '/metrics/meetings?type=live&page_size=100');
      liveMeetings = liveData.meetings || [];
    } catch (e) {}
    
    res.json({
      users: {
        total: users.total_records || 0,
        active: (users.users || []).filter(u => u.status === 'active').length,
        pending: (users.users || []).filter(u => u.status === 'pending').length
      },
      meetings: {
        upcoming: upcomingMeetings,
        live: liveMeetings.length,
        live_details: liveMeetings.slice(0, 5)
      },
      account: accountInfo
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get real-time meeting metrics
router.get('/metrics/meetings', async (req, res) => {
  try {
    const { type = 'live' } = req.query;
    const metrics = await zoomApi('GET', `/metrics/meetings?type=${type}&page_size=100`);
    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get CRC port usage
router.get('/metrics/crc', async (req, res) => {
  try {
    const { from, to } = req.query;
    const today = new Date();
    const defaultFrom = new Date(today.setDate(today.getDate() - 7)).toISOString().split('T')[0];
    const defaultTo = new Date().toISOString().split('T')[0];
    
    const crc = await zoomApi('GET', `/metrics/crc?from=${from || defaultFrom}&to=${to || defaultTo}`);
    res.json(crc);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get client feedback
router.get('/metrics/feedback', async (req, res) => {
  try {
    const { from, to } = req.query;
    const today = new Date();
    const defaultFrom = new Date(today.setMonth(today.getMonth() - 1)).toISOString().split('T')[0];
    const defaultTo = new Date().toISOString().split('T')[0];
    
    const feedback = await zoomApi('GET', `/metrics/client/feedback?from=${from || defaultFrom}&to=${to || defaultTo}`);
    res.json(feedback);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get quality of service data
router.get('/metrics/qos', async (req, res) => {
  try {
    const { meeting_id } = req.query;
    if (!meeting_id) {
      return res.status(400).json({ error: 'meeting_id is required' });
    }
    const qos = await zoomApi('GET', `/metrics/meetings/${meeting_id}/participants/qos`);
    res.json(qos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get IM metrics
router.get('/metrics/im', async (req, res) => {
  try {
    const { from, to } = req.query;
    const today = new Date();
    const defaultFrom = new Date(today.setMonth(today.getMonth() - 1)).toISOString().split('T')[0];
    const defaultTo = new Date().toISOString().split('T')[0];
    
    const im = await zoomApi('GET', `/metrics/im?from=${from || defaultFrom}&to=${to || defaultTo}`);
    res.json(im);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Quick stats for the dashboard
router.get('/quick-stats', async (req, res) => {
  try {
    const now = new Date();
    const monthAgo = new Date(now.setMonth(now.getMonth() - 1));
    
    const [users, dailyReport] = await Promise.all([
      zoomApi('GET', '/users?page_size=300'),
      zoomApi('GET', `/report/daily?year=${new Date().getFullYear()}&month=${new Date().getMonth() + 1}`).catch(() => ({ dates: [] }))
    ]);
    
    // Calculate totals from daily report
    const totalMeetings = (dailyReport.dates || []).reduce((sum, d) => sum + (d.meetings || 0), 0);
    const totalParticipants = (dailyReport.dates || []).reduce((sum, d) => sum + (d.participants || 0), 0);
    const totalMinutes = (dailyReport.dates || []).reduce((sum, d) => sum + (d.meeting_minutes || 0), 0);
    
    res.json({
      total_users: users.total_records || 0,
      meetings_this_month: totalMeetings,
      participants_this_month: totalParticipants,
      minutes_this_month: totalMinutes,
      daily_data: dailyReport.dates || []
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
