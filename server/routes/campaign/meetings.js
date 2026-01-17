/**
 * Campaign Meeting Routes
 * Zoom meeting creation and management
 */

import express from 'express';
import { campaignService } from '../../services/campaignService.js';

const router = express.Router();

// Create Zoom meetings for scheduled contacts
router.post('/create', async (req, res) => {
  try {
    const { limit = 10 } = req.body;
    const result = await campaignService.createZoomMeetings(limit);
    res.json({
      success: true,
      message: `${result.created} Zoom meetings created`,
      ...result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create all Zoom meetings (batch)
router.post('/create-all', async (req, res) => {
  try {
    const stats = campaignService.getStats();
    const pending = stats.byStatus?.scheduled || 0;
    
    if (pending === 0) {
      return res.json({ success: true, message: 'No meetings to create', created: 0 });
    }

    const result = await campaignService.createZoomMeetings(pending);
    res.json({
      success: true,
      message: `${result.created} Zoom meetings created`,
      ...result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
