/**
 * Campaign Email Routes
 * Invitations, Reminders, Follow-ups, No-Show
 */

import express from 'express';
import { campaignService } from '../../services/campaignService.js';
import emailService from '../../services/emailService.js';

const router = express.Router();

// Send invitations
router.post('/invitations', async (req, res) => {
  try {
    const { limit = 10 } = req.body;
    const result = await campaignService.sendInvitations(limit);
    res.json({
      success: true,
      message: `${result.sent} invitations sent`,
      ...result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Send all invitations
router.post('/invitations/all', async (req, res) => {
  try {
    const stats = campaignService.getStats();
    const pending = stats.byStatus?.meeting_created || 0;
    
    if (pending === 0) {
      return res.json({ success: true, message: 'No invitations to send', sent: 0 });
    }

    const result = await campaignService.sendInvitations(pending);
    res.json({
      success: true,
      message: `${result.sent} invitations sent`,
      ...result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Send reminders (for meetings within 48h)
router.post('/reminders', async (req, res) => {
  try {
    const { limit = 10 } = req.body;
    const result = await campaignService.sendReminders(limit);
    res.json({
      success: true,
      message: `${result.sent} reminders sent`,
      ...result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Send follow-ups (for meetings 24h+ ago)
router.post('/followups', async (req, res) => {
  try {
    const { limit = 10 } = req.body;
    const result = await campaignService.sendFollowUps(limit);
    res.json({
      success: true,
      message: `${result.sent} follow-ups sent`,
      ...result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
