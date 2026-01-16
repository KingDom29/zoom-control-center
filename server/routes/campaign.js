/**
 * Campaign Routes - Neujahres-Update 2026
 * API endpoints for managing the campaign
 */

import express from 'express';
import path from 'path';
import { campaignService, clickTokens, getTrackingUrl } from '../services/campaignService.js';
import emailService, { getResponseTimeText, EMAIL_TEMPLATES } from '../services/emailService.js';
import { zendeskService } from '../services/zendeskService.js';
import logger from '../utils/logger.js';

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

router.get('/join/:id', async (req, res) => {
  try {
    const contacts = campaignService.getContacts();
    const contact = contacts.find(c => c.id === req.params.id);

    if (!contact) {
      return res.status(404).send('Not found');
    }

    const slotDate = contact.scheduledSlot?.date;
    if (!slotDate) {
      return res.status(400).send('No scheduled slot');
    }

    const nowDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Berlin',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());

    if (nowDate < slotDate) {
      const html = `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Zoom-Link noch nicht verfügbar</title>
  </head>
  <body style="font-family: Arial, sans-serif; padding: 24px;">
    <h2 style="margin: 0 0 12px;">Der Zoom-Link ist noch nicht verfügbar</h2>
    <p style="margin: 0 0 12px;">Dieser Link wird erst am Tag des Termins freigeschaltet.</p>
    <p style="margin: 0; color: #666;">Termin: ${slotDate}</p>
  </body>
</html>`;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(html);
    }

    if (!contact.zoomJoinUrl) {
      return res.status(404).send('Meeting not ready');
    }

    return res.redirect(contact.zoomJoinUrl);
  } catch (error) {
    res.status(500).send('Error');
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

// =============================================
// DATA ENRICHMENT & SEGMENTATION
// =============================================

// POST /api/campaign/enrich - Enrich all contacts with segments and scores
router.post('/enrich', async (req, res) => {
  try {
    const result = await campaignService.enrichAllContacts();
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/campaign/segments - Get segment statistics
router.get('/segments', (req, res) => {
  try {
    const contacts = campaignService.getContacts();
    const segments = {
      jan_ok: contacts.filter(c => c.segment === 'jan_ok').length,
      feb_soon: contacts.filter(c => c.segment === 'feb_soon').length,
      march_late: contacts.filter(c => c.segment === 'march_late').length,
      very_late: contacts.filter(c => c.segment === 'very_late').length,
      no_meeting: contacts.filter(c => c.segment === 'no_meeting').length
    };
    
    const priorities = {
      high: contacts.filter(c => c.priority === 'high').length,
      medium: contacts.filter(c => c.priority === 'medium').length,
      low: contacts.filter(c => c.priority === 'low').length
    };
    
    const replies = {
      total: contacts.filter(c => c.hasReplied).length,
      positive: contacts.filter(c => c.replySentiment === 'positive').length,
      negative: contacts.filter(c => c.replySentiment === 'negative').length,
      neutral: contacts.filter(c => c.replySentiment === 'neutral').length,
      urgent: contacts.filter(c => c.replyCategory === 'urgent').length,
      reschedule: contacts.filter(c => c.replyCategory === 'reschedule').length
    };
    
    res.json({ success: true, segments, priorities, replies });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/campaign/call-list - Get priority call list
router.get('/call-list', (req, res) => {
  try {
    const { limit = 50, minScore = 30, segment, hasPhone } = req.query;
    const list = campaignService.getPriorityCallList({
      limit: parseInt(limit),
      minScore: parseInt(minScore),
      segment: segment || null,
      hasPhone: hasPhone === 'true'
    });
    res.json({ success: true, count: list.length, contacts: list });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/campaign/reengagement-list - Get contacts needing re-engagement
router.get('/reengagement-list', (req, res) => {
  try {
    const list = campaignService.getReengagementList();
    res.json({ success: true, count: list.length, contacts: list });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/campaign/sync-replies - Sync email replies to contacts
router.post('/sync-replies', async (req, res) => {
  try {
    const { emailService } = await import('../services/emailService.js');
    
    // Get campaign replies
    const contacts = campaignService.getContacts();
    const contactEmails = contacts.map(c => c.email).filter(Boolean);
    const { replies } = await emailService.getCampaignReplies(contactEmails);
    
    // Sync to contacts
    const result = await campaignService.syncRepliesToContacts(replies);
    
    // Re-enrich after sync
    await campaignService.enrichAllContacts();
    
    res.json({ success: true, ...result, repliesFound: replies.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/campaign/reengagement/:id/sent - Mark re-engagement sent
router.post('/reengagement/:id/sent', (req, res) => {
  try {
    campaignService.markReengagementSent(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/campaign/send-reengagement - Bulk send re-engagement emails
router.post('/send-reengagement', async (req, res) => {
  try {
    const { limit = 110, dryRun = false } = req.body;
    const { emailService } = await import('../services/emailService.js');
    
    // Get contacts needing re-engagement
    const list = campaignService.getReengagementList();
    const toSend = list.slice(0, limit);
    
    if (toSend.length === 0) {
      return res.json({ success: true, sent: 0, message: 'No contacts need re-engagement' });
    }
    
    const results = { sent: 0, failed: 0, errors: [] };
    
    for (const contact of toSend) {
      try {
        const anrede = contact.name ? `Hallo ${contact.name.split(' ')[0]}` : 'Guten Tag';
        
        // Generate tracking URLs for this contact
        const quickCallUrl = getTrackingUrl(contact.id, 'quick-call');
        const noInterestUrl = getTrackingUrl(contact.id, 'no-interest');
        
        if (!dryRun) {
          await emailService.sendTemplateEmail({
            to: contact.email,
            templateId: 'reengagement_late',
            variables: {
              anrede,
              monat: contact.monthName,
              firma: contact.firma,
              quick_call_url: quickCallUrl,
              no_interest_url: noInterestUrl
            }
          });
          
          campaignService.markReengagementSent(contact.id);
        }
        
        results.sent++;
      } catch (error) {
        results.failed++;
        results.errors.push({ id: contact.id, email: contact.email, error: error.message });
      }
    }
    
    res.json({ 
      success: true, 
      dryRun,
      ...results, 
      remaining: list.length - toSend.length 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/campaign/reengagement-status - Get re-engagement progress
router.get('/reengagement-status', (req, res) => {
  try {
    const contacts = campaignService.getContacts();
    const lateContacts = contacts.filter(c => c.segment === 'march_late' || c.segment === 'very_late');
    const sent = lateContacts.filter(c => c.reengagementSentAt).length;
    const pending = lateContacts.filter(c => !c.reengagementSentAt).length;
    
    res.json({
      success: true,
      total: lateContacts.length,
      sent,
      pending,
      percentComplete: lateContacts.length > 0 ? Math.round((sent / lateContacts.length) * 100) : 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/campaign/actionable-replies - Get replies that need action
router.get('/actionable-replies', (req, res) => {
  try {
    const contacts = campaignService.getContacts();
    
    const actionable = contacts
      .filter(c => c.hasReplied && !c.replyHandledAt)
      .map(c => ({
        id: c.id,
        name: `${c.vorname} ${c.nachname}`.trim() || c.firma,
        firma: c.firma,
        email: c.email,
        telefon: c.telefon,
        segment: c.segment,
        priority: c.priority,
        priorityScore: c.priorityScore,
        replySentiment: c.replySentiment,
        replyCategory: c.replyCategory,
        lastReply: c.replies?.[c.replies.length - 1] || null,
        suggestedAction: getSuggestedAction(c)
      }))
      .sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));
    
    res.json({ success: true, count: actionable.length, contacts: actionable });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

function getSuggestedAction(contact) {
  if (contact.replyCategory === 'urgent') return '🔴 SOFORT ANRUFEN';
  if (contact.replySentiment === 'negative') return '⚠️ Absage/Kündigung prüfen';
  if (contact.replyCategory === 'reschedule') return '📅 Neuen Termin anbieten';
  if (contact.replyCategory === 'question') return '📧 Frage beantworten';
  if (contact.replySentiment === 'positive') return '✅ Bestätigung - evtl. danken';
  return '📝 Manuell prüfen';
}

// POST /api/campaign/reply-handled/:id - Mark reply as handled
router.post('/reply-handled/:id', (req, res) => {
  try {
    const { action, note } = req.body;
    const contacts = campaignService.getContacts();
    const idx = contacts.findIndex(c => c.id === req.params.id);
    
    if (idx >= 0) {
      contacts[idx].replyHandledAt = new Date().toISOString();
      contacts[idx].replyHandledAction = action || 'handled';
      if (note) contacts[idx].replyHandledNote = note;
      campaignService.saveCampaign();
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =============================================
// CLICK TRACKING ENDPOINTS
// =============================================

// GET /api/campaign/track/:action/:token - Handle email button click
router.get('/track/:action/:token', async (req, res) => {
  const { action, token } = req.params;
  const tokenData = clickTokens.get(token);
  
  if (!tokenData) {
    return res.send(`
      <html><body style="font-family: Arial; text-align: center; padding: 50px;">
        <h2>⚠️ Link abgelaufen</h2>
        <p>Bitte kontaktieren Sie uns direkt unter <a href="mailto:support@maklerplan.com">support@maklerplan.com</a></p>
      </body></html>
    `);
  }
  
  const { contactId } = tokenData;
  const contacts = campaignService.getContacts();
  const contact = contacts.find(c => c.id === contactId);
  
  if (!contact) {
    return res.send('<html><body><h2>Kontakt nicht gefunden</h2></body></html>');
  }
  
  // Log the click
  const idx = contacts.findIndex(c => c.id === contactId);
  if (!contacts[idx].clickActions) contacts[idx].clickActions = [];
  contacts[idx].clickActions.push({
    action,
    clickedAt: new Date().toISOString(),
    token
  });
  contacts[idx].lastClickAction = action;
  contacts[idx].lastClickAt = new Date().toISOString();
  
  // Update priority based on action
  if (action === 'quick-call' || action === 'urgent') {
    contacts[idx].replyCategory = 'urgent';
    contacts[idx].priorityScore = Math.min(100, (contacts[idx].priorityScore || 0) + 30);
    contacts[idx].priority = 'high';
  }
  
  campaignService.saveCampaign();
  
  // Send WebSocket notification
  try {
    const ws = await import('../utils/websocket.js');
    ws.broadcast({
      type: 'EMERGENCY_CALL_REQUEST',
      data: {
        contactId,
        action,
        name: `${contact.vorname} ${contact.nachname}`.trim() || contact.firma,
        firma: contact.firma,
        email: contact.email,
        telefon: contact.telefon,
        timestamp: new Date().toISOString()
      }
    });
  } catch (e) {
    logger.warn('WebSocket broadcast failed', { error: e.message });
  }
  
  logger.info(`🚨 CLICK: ${action} von ${contact.firma} (${contact.email})`);
  
  // Zendesk Ticket erstellen
  const meetingInfo = contact.scheduledSlot ? {
    date: new Date(contact.scheduledSlot.startTime).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }),
    time: new Date(contact.scheduledSlot.startTime).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })
  } : null;

  try {
    const ticket = await zendeskService.createCampaignClickTicket(contact, action, meetingInfo);
    if (ticket) {
      logger.info(`🎫 Zendesk Ticket #${ticket.id} erstellt für ${contact.email}`);
    }
  } catch (zendeskError) {
    logger.error('Zendesk Ticket Fehler', { error: zendeskError.message });
    // Fallback: E-Mail senden
    try {
      const actionLabels = {
        'quick-call': '🚀 SCHNELL-TERMIN ANGEFORDERT',
        'urgent': '📞 DRINGENDER RÜCKRUF',
        'book': '📅 Buchung angefordert',
        'no-interest': '❌ Kein Interesse',
        'cancel': '🚫 TERMIN ABGESAGT'
      };
      const contactName = `${contact.vorname} ${contact.nachname}`.trim() || contact.firma;
      const isUrgent = action === 'quick-call' || action === 'urgent' || action === 'cancel';
      await emailService.sendEmail({
        to: 'support@maklerplan.com',
        subject: `${isUrgent ? '🚨 URGENT: ' : ''}${actionLabels[action] || action} - ${contactName}`,
        body: `<p>Aktion: ${action}</p><p>E-Mail: ${contact.email}</p><p>Firma: ${contact.firma}</p><p>Telefon: ${contact.telefon || '-'}</p>`
      });
      logger.info(`📧 Fallback E-Mail gesendet für ${contact.email}`);
    } catch (emailError) {
      logger.error('Fallback E-Mail auch fehlgeschlagen', { error: emailError.message });
    }
  }
  
  // Invalidate token (one-time use)
  clickTokens.delete(token);
  
  // Show confirmation page based on action
  const messages = {
    'quick-call': {
      title: '🚀 Schnell-Termin angefordert!',
      body: 'Wir melden uns innerhalb von 2 Stunden bei Ihnen.'
    },
    'urgent': {
      title: '📞 Rückruf angefordert!',
      body: 'Wir rufen Sie so schnell wie möglich an.'
    },
    'book': {
      title: '📅 Weiterleitung...',
      body: 'Sie werden zu unserem Buchungstool weitergeleitet.',
      redirect: 'https://booking.maklerplan.com'
    },
    'no-interest': {
      title: '✅ Verstanden',
      body: 'Sie werden keine weiteren Nachrichten erhalten.'
    },
    'cancel': {
      title: '🚫 Termin abgesagt',
      body: 'Wir haben Ihre Absage erhalten. Wenn Sie einen neuen Termin möchten, besuchen Sie booking.maklerplan.com'
    }
  };
  
  const msg = messages[action] || { title: '✅ Aktion erfasst', body: 'Danke für Ihre Rückmeldung.' };
  
  if (msg.redirect) {
    return res.redirect(msg.redirect);
  }
  
  res.send(`
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Maklerplan</title>
      <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
        .card { background: white; max-width: 400px; margin: 0 auto; padding: 40px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h2 { color: #333; margin-bottom: 20px; }
        p { color: #666; }
        .contact { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 14px; color: #999; }
      </style>
    </head>
    <body>
      <div class="card">
        <h2>${msg.title}</h2>
        <p>${msg.body}</p>
        <p class="contact">
          Maklerplan · +49 30 219 25007<br>
          <a href="mailto:support@maklerplan.com">support@maklerplan.com</a>
        </p>
      </div>
    </body>
    </html>
  `);
});

// POST /api/campaign/generate-tracking-links/:id - Generate tracking links for a contact
router.post('/generate-tracking-links/:id', (req, res) => {
  try {
    const contactId = req.params.id;
    const contact = campaignService.getContacts().find(c => c.id === contactId);
    
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    
    const links = {
      quickCall: getTrackingUrl(contactId, 'quick-call'),
      urgent: getTrackingUrl(contactId, 'urgent'),
      book: getTrackingUrl(contactId, 'book'),
      noInterest: getTrackingUrl(contactId, 'no-interest')
    };
    
    res.json({ success: true, contactId, links });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/campaign/click-requests - Get all pending click requests (emergency calls etc)
router.get('/click-requests', (req, res) => {
  try {
    const contacts = campaignService.getContacts();
    const requests = contacts
      .filter(c => c.lastClickAction && !c.clickHandledAt)
      .map(c => ({
        id: c.id,
        name: `${c.vorname} ${c.nachname}`.trim() || c.firma,
        firma: c.firma,
        email: c.email,
        telefon: c.telefon,
        action: c.lastClickAction,
        clickedAt: c.lastClickAt,
        allClicks: c.clickActions || []
      }))
      .sort((a, b) => new Date(b.clickedAt) - new Date(a.clickedAt));
    
    res.json({ success: true, count: requests.length, requests });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/campaign/click-handled/:id - Mark click request as handled
router.post('/click-handled/:id', (req, res) => {
  try {
    const contacts = campaignService.getContacts();
    const idx = contacts.findIndex(c => c.id === req.params.id);
    
    if (idx >= 0) {
      contacts[idx].clickHandledAt = new Date().toISOString();
      contacts[idx].clickHandledBy = req.body.handledBy || 'system';
      campaignService.saveCampaign();
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/campaign/daily-report - Get daily campaign report
router.get('/daily-report', (req, res) => {
  try {
    const contacts = campaignService.getContacts();
    const today = new Date().toISOString().split('T')[0];
    
    // Today's stats
    const todayInvitations = contacts.filter(c => 
      c.invitationSentAt?.startsWith(today)
    ).length;
    
    const todayReminders = contacts.filter(c => 
      c.reminderSentAt?.startsWith(today)
    ).length;
    
    const todayReengagement = contacts.filter(c => 
      c.reengagementSentAt?.startsWith(today)
    ).length;
    
    const todayClicks = contacts.filter(c => 
      c.lastClickAt?.startsWith(today)
    ).map(c => ({
      firma: c.firma,
      action: c.lastClickAction,
      time: c.lastClickAt
    }));
    
    const todayReplies = contacts.filter(c => 
      c.lastReplyAt?.startsWith(today)
    ).map(c => ({
      firma: c.firma,
      sentiment: c.replySentiment,
      category: c.replyCategory,
      preview: c.replies?.[c.replies.length - 1]?.preview?.substring(0, 100)
    }));
    
    // Overall stats
    const stats = {
      total: contacts.length,
      invitationsSent: contacts.filter(c => c.invitationSentAt).length,
      remindersSent: contacts.filter(c => c.reminderSentAt).length,
      reengagementSent: contacts.filter(c => c.reengagementSentAt).length,
      reengagementPending: contacts.filter(c => 
        (c.segment === 'march_late' || c.segment === 'very_late') && !c.reengagementSentAt
      ).length,
      totalReplies: contacts.filter(c => c.hasReplied).length,
      totalClicks: contacts.filter(c => c.lastClickAction).length,
      urgentRequests: contacts.filter(c => 
        c.lastClickAction === 'quick-call' && !c.clickHandledAt
      ).length
    };
    
    res.json({
      success: true,
      date: today,
      today: {
        invitations: todayInvitations,
        reminders: todayReminders,
        reengagement: todayReengagement,
        clicks: todayClicks,
        replies: todayReplies
      },
      overall: stats
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/campaign/send-daily-report - Send daily report email to team
router.post('/send-daily-report', async (req, res) => {
  try {
    const contacts = campaignService.getContacts();
    const today = new Date().toISOString().split('T')[0];
    const todayFormatted = new Date().toLocaleDateString('de-DE', { 
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
    });
    
    // Collect stats
    const todayInvitations = contacts.filter(c => c.invitationSentAt?.startsWith(today)).length;
    const todayReminders = contacts.filter(c => c.reminderSentAt?.startsWith(today)).length;
    const todayReengagement = contacts.filter(c => c.reengagementSentAt?.startsWith(today)).length;
    const todayClicks = contacts.filter(c => c.lastClickAt?.startsWith(today)).length;
    const todayReplies = contacts.filter(c => c.lastReplyAt?.startsWith(today)).length;
    const urgentRequests = contacts.filter(c => c.lastClickAction === 'quick-call' && !c.clickHandledAt).length;
    
    const totalReengagement = contacts.filter(c => c.reengagementSentAt).length;
    const pendingReengagement = contacts.filter(c => 
      (c.segment === 'march_late' || c.segment === 'very_late') && !c.reengagementSentAt
    ).length;
    
    // Build urgent section if needed
    let urgentSection = '';
    if (urgentRequests > 0) {
      const urgentContacts = contacts
        .filter(c => c.lastClickAction === 'quick-call' && !c.clickHandledAt)
        .slice(0, 5);
      
      urgentSection = `
        <h2 style="color: #e74c3c; border-bottom: 2px solid #e74c3c; padding-bottom: 10px;">🚨 Sofort anrufen!</h2>
        <ul style="list-style: none; padding: 0;">
          ${urgentContacts.map(c => `
            <li style="background: #fff3cd; padding: 10px; margin: 5px 0; border-radius: 4px;">
              <strong>${c.firma || c.nachname}</strong><br>
              📞 ${c.telefon || 'keine Nummer'} · ✉️ ${c.email}
            </li>
          `).join('')}
        </ul>
      `;
    }
    
    // Send report
    const recipients = req.body.recipients || ['support@maklerplan.com'];
    
    await emailService.sendEmail({
      to: recipients,
      subject: emailService.replaceVariables(EMAIL_TEMPLATES.daily_report.subject, { datum: todayFormatted }),
      body: emailService.replaceVariables(EMAIL_TEMPLATES.daily_report.body, {
        datum: todayFormatted,
        today_invitations: todayInvitations.toString(),
        today_reminders: todayReminders.toString(),
        today_reengagement: todayReengagement.toString(),
        today_clicks: todayClicks.toString(),
        today_replies: todayReplies.toString(),
        urgent_requests: urgentRequests.toString(),
        total_contacts: contacts.length.toString(),
        total_invitations: contacts.filter(c => c.invitationSentAt).length.toString(),
        total_reengagement: totalReengagement.toString(),
        pending_reengagement: pendingReengagement.toString(),
        total_replies: contacts.filter(c => c.hasReplied).length.toString(),
        urgent_section: urgentSection
      })
    });
    
    logger.info(`📊 Daily report sent to ${recipients.join(', ')}`);
    res.json({ success: true, sentTo: recipients });
  } catch (error) {
    logger.error('Send daily report error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// POST /api/campaign/auto-reply/:id - Send auto-reply based on category
router.post('/auto-reply/:id', async (req, res) => {
  try {
    const contacts = campaignService.getContacts();
    const contact = contacts.find(c => c.id === req.params.id);
    
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    
    // Determine template based on category
    const category = req.body.category || contact.replyCategory || 'question';
    const templateMap = {
      'reschedule': 'auto_reply_reschedule',
      'question': 'auto_reply_question',
      'cancel': 'auto_reply_cancel',
      'negative': 'auto_reply_cancel',
      'positive': 'auto_reply_positive',
      'urgent': 'auto_reply_positive'
    };
    
    const templateId = templateMap[category] || 'auto_reply_question';
    const template = EMAIL_TEMPLATES[templateId];
    
    if (!template) {
      return res.status(400).json({ error: 'Template not found' });
    }
    
    const anrede = contact.anrede === 'Frau' ? 'Sehr geehrte Frau ' + (contact.nachname || '') :
                   contact.anrede === 'Herr' ? 'Sehr geehrter Herr ' + (contact.nachname || '') :
                   'Guten Tag';
    
    // Calculate smart response time based on weekends/holidays
    const isUrgent = category === 'positive' || category === 'urgent';
    const responseTime = getResponseTimeText(isUrgent);
    
    await emailService.sendEmail({
      to: contact.email,
      replyTo: 'support@maklerplan.com',
      subject: emailService.replaceVariables(template.subject, { firma: contact.firma }),
      body: emailService.replaceVariables(template.body, {
        anrede,
        firma: contact.firma,
        response_time: responseTime
      })
    });
    
    // Mark as replied
    const idx = contacts.findIndex(c => c.id === req.params.id);
    contacts[idx].autoReplySentAt = new Date().toISOString();
    contacts[idx].autoReplyTemplate = templateId;
    campaignService.saveCampaign();
    
    logger.info(`📧 Auto-reply (${templateId}) sent to ${contact.email}`);
    res.json({ success: true, template: templateId, sentTo: contact.email });
  } catch (error) {
    logger.error('Auto-reply error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// POST /api/campaign/process-replies - Auto-process all pending replies
router.post('/process-replies', async (req, res) => {
  try {
    const contacts = campaignService.getContacts();
    const { dryRun = true } = req.body;
    
    const pending = contacts.filter(c => 
      c.hasReplied && !c.replyHandledAt && !c.autoReplySentAt
    );
    
    const results = [];
    
    for (const contact of pending) {
      const category = contact.replyCategory || 'other';
      
      // Skip 'other' - needs manual review
      if (category === 'other') {
        results.push({
          id: contact.id,
          firma: contact.firma,
          category,
          action: 'skip_manual_review',
          sent: false
        });
        continue;
      }
      
      if (!dryRun) {
        // Actually send auto-reply
        const templateMap = {
          'reschedule': 'auto_reply_reschedule',
          'question': 'auto_reply_question',
          'cancel': 'auto_reply_cancel',
          'negative': 'auto_reply_cancel',
          'positive': 'auto_reply_positive',
          'urgent': 'auto_reply_positive'
        };
        
        const templateId = templateMap[category];
        if (templateId) {
          const template = EMAIL_TEMPLATES[templateId];
          const anrede = contact.anrede === 'Frau' ? 'Sehr geehrte Frau ' + (contact.nachname || '') :
                         contact.anrede === 'Herr' ? 'Sehr geehrter Herr ' + (contact.nachname || '') :
                         'Guten Tag';
          
          // Smart response time based on weekends/holidays
          const isUrgent = category === 'positive' || category === 'urgent';
          const responseTime = getResponseTimeText(isUrgent);
          
          await emailService.sendEmail({
            to: contact.email,
            replyTo: 'support@maklerplan.com',
            subject: emailService.replaceVariables(template.subject, { firma: contact.firma }),
            body: emailService.replaceVariables(template.body, { anrede, firma: contact.firma, response_time: responseTime })
          });
          
          const idx = contacts.findIndex(c => c.id === contact.id);
          contacts[idx].autoReplySentAt = new Date().toISOString();
          contacts[idx].autoReplyTemplate = templateId;
        }
      }
      
      results.push({
        id: contact.id,
        firma: contact.firma,
        email: contact.email,
        category,
        action: dryRun ? 'would_send' : 'sent',
        sent: !dryRun
      });
    }
    
    if (!dryRun) {
      campaignService.saveCampaign();
    }
    
    res.json({
      success: true,
      dryRun,
      total: pending.length,
      processed: results.filter(r => r.action !== 'skip_manual_review').length,
      skipped: results.filter(r => r.action === 'skip_manual_review').length,
      results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Export tracking URL generator for use in other modules
export { getTrackingUrl };

export default router;
