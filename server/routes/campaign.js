/**
 * Campaign Routes - Neujahres-Update 2026
 * API endpoints for managing the campaign
 */

import express from 'express';
import path from 'path';
import { campaignService } from '../services/campaignService.js';

const router = express.Router();

// ============================================
// IMPORT ENDPOINTS
// ============================================

// Import contacts from CSV
router.post('/import/csv', async (req, res) => {
  try {
    const { filePath } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ error: 'filePath is required' });
    }

    const result = await campaignService.importFromCSV(filePath);
    res.json({
      success: true,
      message: `${result.imported} contacts imported`,
      ...result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Import contacts from Excel
router.post('/import/excel', async (req, res) => {
  try {
    const { filePath } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ error: 'filePath is required' });
    }

    const result = await campaignService.importFromExcel(filePath);
    res.json({
      success: true,
      message: `${result.imported} contacts imported`,
      ...result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Quick import from default CSV path
router.post('/import/default', async (req, res) => {
  try {
    const defaultPath = path.join(process.cwd(), 'makler-liste.csv');
    const result = await campaignService.importFromCSV(defaultPath);
    res.json({
      success: true,
      message: `${result.imported} contacts imported from makler-liste.csv`,
      ...result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// SCHEDULING ENDPOINTS
// ============================================

// Schedule all pending contacts
router.post('/schedule', async (req, res) => {
  try {
    const result = campaignService.scheduleContacts();
    res.json({
      success: true,
      message: `${result.scheduled} contacts scheduled`,
      ...result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get schedule preview
router.get('/schedule', async (req, res) => {
  try {
    const preview = campaignService.getSchedulePreview();
    res.json(preview);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get schedule for specific date
router.get('/schedule/:date', async (req, res) => {
  try {
    const preview = campaignService.getSchedulePreview();
    const dateSchedule = preview.byDate[req.params.date] || [];
    res.json({
      date: req.params.date,
      slots: dateSchedule
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ZOOM MEETING ENDPOINTS
// ============================================

// Create Zoom meetings for scheduled contacts
router.post('/meetings/create', async (req, res) => {
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
router.post('/meetings/create-all', async (req, res) => {
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

// ============================================
// EMAIL ENDPOINTS
// ============================================

// Send invitations
router.post('/emails/invitations', async (req, res) => {
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
router.post('/emails/invitations/all', async (req, res) => {
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
router.post('/emails/reminders', async (req, res) => {
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
router.post('/emails/followups', async (req, res) => {
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

// Get ICS calendar for a contact
router.get('/contacts/:id/calendar.ics', async (req, res) => {
  try {
    const contacts = campaignService.getContacts();
    const contact = contacts.find(c => c.id === req.params.id);
    
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const ics = campaignService.generateICS(contact);
    if (!ics) {
      return res.status(400).json({ error: 'No scheduled slot for this contact' });
    }

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="meeting-${contact.id}.ics"`);
    res.send(ics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// STATS & MANAGEMENT
// ============================================

// Get campaign stats
router.get('/stats', async (req, res) => {
  try {
    const stats = campaignService.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all contacts
router.get('/contacts', async (req, res) => {
  try {
    const { status, search } = req.query;
    const contacts = campaignService.getContacts({ status, search });
    res.json({
      total: contacts.length,
      contacts
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single contact
router.get('/contacts/:id', async (req, res) => {
  try {
    const contacts = campaignService.getContacts();
    const contact = contacts.find(c => c.id === req.params.id);
    
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    
    res.json(contact);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reset campaign (dangerous!)
router.delete('/reset', async (req, res) => {
  try {
    const { confirm } = req.body;
    
    if (confirm !== 'RESET_CAMPAIGN') {
      return res.status(400).json({ 
        error: 'Please confirm by sending { "confirm": "RESET_CAMPAIGN" }' 
      });
    }

    const result = campaignService.resetCampaign();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// WORKFLOW ENDPOINTS
// ============================================

// Full workflow: Import -> Schedule -> Preview
router.post('/workflow/prepare', async (req, res) => {
  try {
    const { csvPath } = req.body;
    const filePath = csvPath || path.join(process.cwd(), 'makler-liste.csv');

    // Step 1: Import
    const importResult = await campaignService.importFromCSV(filePath);
    
    // Step 2: Schedule
    const scheduleResult = campaignService.scheduleContacts();
    
    // Step 3: Get preview
    const preview = campaignService.getSchedulePreview();

    res.json({
      success: true,
      import: importResult,
      schedule: scheduleResult,
      preview: {
        totalSlots: preview.totalSlots,
        firstDate: preview.dates[0],
        lastDate: preview.dates[preview.dates.length - 1],
        sampleDays: Object.fromEntries(
          Object.entries(preview.byDate).slice(0, 3)
        )
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Execute: Create meetings + Send invitations
router.post('/workflow/execute', async (req, res) => {
  try {
    const { createMeetings = true, sendEmails = true, limit = 10 } = req.body;

    const results = {
      meetings: null,
      invitations: null
    };

    if (createMeetings) {
      results.meetings = await campaignService.createZoomMeetings(limit);
    }

    if (sendEmails) {
      results.invitations = await campaignService.sendInvitations(limit);
    }

    res.json({
      success: true,
      ...results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// SCHEDULER ENDPOINTS
// ============================================

// Get scheduler status
router.get('/scheduler/status', async (req, res) => {
  try {
    const stats = await campaignService.getStats();
    res.json({
      success: true,
      scheduler: {
        active: true,
        schedule: 'Täglich um 08:00 Uhr (Europe/Berlin)',
        nextRun: getNextScheduledRun()
      },
      campaign: {
        total: stats.total,
        withMeeting: stats.withMeeting,
        invited: stats.invited,
        remaining: stats.total - stats.invited
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper function to get next scheduled run
function getNextScheduledRun() {
  const now = new Date();
  const next = new Date();
  next.setHours(8, 0, 0, 0);
  if (now.getHours() >= 8) {
    next.setDate(next.getDate() + 1);
  }
  return next.toISOString();
}

// ============================================
// ATTENDANCE / NO-SHOW TRACKING
// ============================================

// Get attendance statistics
router.get('/stats/attendance', async (req, res) => {
  try {
    const stats = campaignService.getAttendanceStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all no-shows
router.get('/contacts/status/no_show', async (req, res) => {
  try {
    const contacts = campaignService.getContacts({ status: 'invitation_sent' })
      .filter(c => c.attendanceStatus === 'no_show');
    res.json({
      total: contacts.length,
      contacts
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get contacts by attendance status
router.get('/contacts/attendance/:status', async (req, res) => {
  try {
    const { status } = req.params;
    const validStatuses = ['attended', 'no_show', 'partial'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        error: `Invalid status. Valid: ${validStatuses.join(', ')}` 
      });
    }

    const allContacts = campaignService.getContacts();
    const contacts = allContacts.filter(c => c.attendanceStatus === status);
    
    res.json({
      total: contacts.length,
      contacts
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Manually send no-show follow-up email
router.post('/noshow/:id/followup', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await campaignService.sendManualNoShowEmail(id);
    res.json({
      success: true,
      message: 'No-show follow-up email sent',
      ...result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Process pending no-show emails (called by scheduler or manually)
router.post('/noshow/process-pending', async (req, res) => {
  try {
    const result = await campaignService.processPendingNoShowEmails();
    res.json({
      success: true,
      message: `${result.sent} no-show emails sent`,
      ...result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Process meeting.ended webhook for attendance tracking
router.post('/webhook/meeting-ended', async (req, res) => {
  try {
    const { meetingId, participants = [] } = req.body;
    
    if (!meetingId) {
      return res.status(400).json({ error: 'meetingId is required' });
    }

    const result = await campaignService.processMeetingEnd(meetingId, participants);
    
    if (!result) {
      return res.json({ 
        success: false, 
        message: 'No campaign contact found for this meeting' 
      });
    }

    res.json({
      success: true,
      message: `Attendance tracked: ${result.attendanceStatus}`,
      ...result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Test endpoint: Simulate meeting end for a contact
router.post('/test/meeting-ended', async (req, res) => {
  try {
    const { contactId, attended = false, duration = 0 } = req.body;
    
    const contacts = campaignService.getContacts();
    const contact = contacts.find(c => c.id === contactId);
    
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    if (!contact.zoomMeetingId) {
      return res.status(400).json({ error: 'Contact has no Zoom meeting' });
    }

    // Simulate participants based on test parameters
    const participants = attended ? [{
      user_email: contact.email,
      duration: duration
    }] : [];

    const result = await campaignService.processMeetingEnd(
      contact.zoomMeetingId, 
      participants
    );

    res.json({
      success: true,
      message: `Test: ${result.attendanceStatus}`,
      ...result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
