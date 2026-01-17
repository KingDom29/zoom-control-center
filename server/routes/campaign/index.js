/**
 * Campaign Routes - Main Router
 * Combines all campaign sub-routers
 */

import express from 'express';
import path from 'path';
import { campaignService, clickTokens, getTrackingUrl } from '../../services/campaignService.js';
import emailService, { getResponseTimeText, EMAIL_TEMPLATES } from '../../services/emailService.js';
import { zendeskService } from '../../services/zendeskService.js';
import logger from '../../utils/logger.js';

// Sub-routers
import emailsRouter from './emails.js';
import meetingsRouter from './meetings.js';
import trackingRouter from './tracking.js';
import contactsRouter from './contacts.js';

const router = express.Router();

// Mount sub-routers
router.use('/emails', emailsRouter);
router.use('/meetings', meetingsRouter);
router.use('/track', trackingRouter);
router.use('/contacts', contactsRouter);

// ============================================
// IMPORT ENDPOINTS
// ============================================

router.post('/import/csv', async (req, res) => {
  try {
    const { filePath } = req.body;
    if (!filePath) return res.status(400).json({ error: 'filePath is required' });
    const result = await campaignService.importFromCSV(filePath);
    res.json({ success: true, message: `${result.imported} contacts imported`, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/import/excel', async (req, res) => {
  try {
    const { filePath } = req.body;
    if (!filePath) return res.status(400).json({ error: 'filePath is required' });
    const result = await campaignService.importFromExcel(filePath);
    res.json({ success: true, message: `${result.imported} contacts imported`, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/import/default', async (req, res) => {
  try {
    const defaultPath = path.join(process.cwd(), 'makler-liste.csv');
    const result = await campaignService.importFromCSV(defaultPath);
    res.json({ success: true, message: `${result.imported} contacts imported from makler-liste.csv`, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// SCHEDULING ENDPOINTS
// ============================================

router.post('/schedule', async (req, res) => {
  try {
    const result = campaignService.scheduleContacts();
    res.json({ success: true, message: `${result.scheduled} contacts scheduled`, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/schedule', async (req, res) => {
  try {
    const preview = campaignService.getSchedulePreview();
    res.json(preview);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/schedule/:date', async (req, res) => {
  try {
    const preview = campaignService.getSchedulePreview();
    const dateSchedule = preview.byDate[req.params.date] || [];
    res.json({ date: req.params.date, slots: dateSchedule });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// STATS & MANAGEMENT
// ============================================

router.get('/stats', async (req, res) => {
  try {
    const stats = campaignService.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/stats/attendance', async (req, res) => {
  try {
    const stats = campaignService.getAttendanceStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/reset', async (req, res) => {
  try {
    const { confirm } = req.body;
    if (confirm !== 'RESET_CAMPAIGN') {
      return res.status(400).json({ error: 'Please confirm by sending { "confirm": "RESET_CAMPAIGN" }' });
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

router.post('/workflow/prepare', async (req, res) => {
  try {
    const { csvPath } = req.body;
    const filePath = csvPath || path.join(process.cwd(), 'makler-liste.csv');
    const importResult = await campaignService.importFromCSV(filePath);
    const scheduleResult = campaignService.scheduleContacts();
    const preview = campaignService.getSchedulePreview();
    res.json({
      success: true,
      import: importResult,
      schedule: scheduleResult,
      preview: {
        totalSlots: preview.totalSlots,
        firstDate: preview.dates[0],
        lastDate: preview.dates[preview.dates.length - 1]
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/workflow/execute', async (req, res) => {
  try {
    const { createMeetings = true, sendEmails = true, limit = 10 } = req.body;
    const results = { meetings: null, invitations: null };
    if (createMeetings) results.meetings = await campaignService.createZoomMeetings(limit);
    if (sendEmails) results.invitations = await campaignService.sendInvitations(limit);
    res.json({ success: true, ...results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// SCHEDULER STATUS
// ============================================

router.get('/scheduler/status', async (req, res) => {
  try {
    const stats = await campaignService.getStats();
    const now = new Date();
    const next = new Date();
    next.setHours(8, 0, 0, 0);
    if (now.getHours() >= 8) next.setDate(next.getDate() + 1);
    
    res.json({
      success: true,
      scheduler: { active: true, schedule: 'Täglich um 08:00 Uhr (Europe/Berlin)', nextRun: next.toISOString() },
      campaign: { total: stats.total, withMeeting: stats.withMeeting, invited: stats.invited, remaining: stats.total - stats.invited }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// NO-SHOW ENDPOINTS
// ============================================

router.post('/noshow/:id/followup', async (req, res) => {
  try {
    const result = await campaignService.sendManualNoShowEmail(req.params.id);
    res.json({ success: true, message: 'No-show follow-up email sent', ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/noshow/process-pending', async (req, res) => {
  try {
    const result = await campaignService.processPendingNoShowEmails();
    res.json({ success: true, message: `${result.sent} no-show emails sent`, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// WEBHOOK ENDPOINTS
// ============================================

router.post('/webhook/meeting-ended', async (req, res) => {
  try {
    const { meetingId, participants = [] } = req.body;
    if (!meetingId) return res.status(400).json({ error: 'meetingId is required' });
    const result = await campaignService.processMeetingEnd(meetingId, participants);
    if (!result) return res.json({ success: false, message: 'No campaign contact found for this meeting' });
    res.json({ success: true, message: `Attendance tracked: ${result.attendanceStatus}`, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/test/meeting-ended', async (req, res) => {
  try {
    const { contactId, attended = false, duration = 0 } = req.body;
    const contacts = campaignService.getContacts();
    const contact = contacts.find(c => c.id === contactId);
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    if (!contact.zoomMeetingId) return res.status(400).json({ error: 'Contact has no Zoom meeting' });
    const participants = attended ? [{ user_email: contact.email, duration }] : [];
    const result = await campaignService.processMeetingEnd(contact.zoomMeetingId, participants);
    res.json({ success: true, message: `Test: ${result.attendanceStatus}`, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ENRICHMENT & SEGMENTATION
// ============================================

router.post('/enrich', async (req, res) => {
  try {
    const result = await campaignService.enrichAllContacts();
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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
    res.json({ success: true, segments, priorities });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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

// ============================================
// RE-ENGAGEMENT
// ============================================

router.get('/reengagement-list', (req, res) => {
  try {
    const list = campaignService.getReengagementList();
    res.json({ success: true, count: list.length, contacts: list });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/reengagement/:id/sent', (req, res) => {
  try {
    campaignService.markReengagementSent(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/send-reengagement', async (req, res) => {
  try {
    const { limit = 110, dryRun = false } = req.body;
    const list = campaignService.getReengagementList();
    const toSend = list.slice(0, limit);
    
    if (toSend.length === 0) {
      return res.json({ success: true, sent: 0, message: 'No contacts need re-engagement' });
    }
    
    const results = { sent: 0, failed: 0, errors: [] };
    
    for (const contact of toSend) {
      try {
        const anrede = contact.name ? `Hallo ${contact.name.split(' ')[0]}` : 'Guten Tag';
        const quickCallUrl = getTrackingUrl(contact.id, 'quick-call');
        const noInterestUrl = getTrackingUrl(contact.id, 'no-interest');
        
        if (!dryRun) {
          await emailService.sendTemplateEmail({
            to: contact.email,
            templateId: 'reengagement_late',
            variables: { anrede, monat: contact.monthName, firma: contact.firma, quick_call_url: quickCallUrl, no_interest_url: noInterestUrl }
          });
          campaignService.markReengagementSent(contact.id);
        }
        results.sent++;
      } catch (error) {
        results.failed++;
        results.errors.push({ id: contact.id, email: contact.email, error: error.message });
      }
    }
    
    res.json({ success: true, dryRun, ...results, remaining: list.length - toSend.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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

// ============================================
// REPLIES
// ============================================

router.post('/sync-replies', async (req, res) => {
  try {
    const contacts = campaignService.getContacts();
    const contactEmails = contacts.map(c => c.email).filter(Boolean);
    const { replies } = await emailService.getCampaignReplies(contactEmails);
    const result = await campaignService.syncRepliesToContacts(replies);
    await campaignService.enrichAllContacts();
    res.json({ success: true, ...result, repliesFound: replies.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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
        lastReply: c.replies?.[c.replies.length - 1] || null
      }))
      .sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));
    res.json({ success: true, count: actionable.length, contacts: actionable });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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

// ============================================
// TRACKING LINKS & CLICKS
// ============================================

router.post('/generate-tracking-links/:id', (req, res) => {
  try {
    const links = {
      quickCall: getTrackingUrl(req.params.id, 'quick-call'),
      noInterest: getTrackingUrl(req.params.id, 'no-interest'),
      book: getTrackingUrl(req.params.id, 'book'),
      cancel: getTrackingUrl(req.params.id, 'cancel')
    };
    res.json({ success: true, links });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/click-requests', (req, res) => {
  try {
    const contacts = campaignService.getContacts();
    const clickRequests = contacts
      .filter(c => c.clickActions && c.clickActions.length > 0)
      .map(c => ({
        id: c.id,
        name: `${c.vorname} ${c.nachname}`.trim() || c.firma,
        firma: c.firma,
        email: c.email,
        telefon: c.telefon,
        lastClickAction: c.lastClickAction,
        lastClickAt: c.lastClickAt,
        clickActions: c.clickActions
      }))
      .sort((a, b) => new Date(b.lastClickAt) - new Date(a.lastClickAt));
    res.json({ success: true, count: clickRequests.length, contacts: clickRequests });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/click-handled/:id', (req, res) => {
  try {
    const contacts = campaignService.getContacts();
    const idx = contacts.findIndex(c => c.id === req.params.id);
    if (idx >= 0) {
      contacts[idx].clickHandledAt = new Date().toISOString();
      campaignService.saveCampaign();
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// DAILY REPORT
// ============================================

router.get('/daily-report', (req, res) => {
  try {
    const stats = campaignService.getStats();
    const attendance = campaignService.getAttendanceStats();
    res.json({ success: true, stats, attendance, generatedAt: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/send-daily-report', async (req, res) => {
  try {
    const { recipients = ['support@maklerplan.com'] } = req.body;
    const stats = campaignService.getStats();
    const attendance = campaignService.getAttendanceStats();
    
    const html = `
      <h2>📊 Tages-Report Kampagne</h2>
      <p><strong>Total:</strong> ${stats.total} | <strong>Eingeladen:</strong> ${stats.invited} | <strong>Mit Meeting:</strong> ${stats.withMeeting}</p>
      <p><strong>Teilgenommen:</strong> ${attendance?.attended || 0} | <strong>No-Show:</strong> ${attendance?.noShow || 0}</p>
      <p style="color: #666; font-size: 12px;">Generiert: ${new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}</p>
    `;
    
    for (const recipient of recipients) {
      await emailService.sendEmail({ to: recipient, subject: '📊 Kampagnen Tages-Report', body: html });
    }
    
    res.json({ success: true, sentTo: recipients });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// AUTO-REPLY
// ============================================

router.post('/auto-reply/:id', async (req, res) => {
  try {
    const result = await campaignService.sendAutoReply(req.params.id);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/process-replies', async (req, res) => {
  try {
    const { dryRun = false } = req.body;
    const result = await campaignService.processAutoReplies({ dryRun });
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// JOIN LINK
// ============================================

router.get('/join/:id', async (req, res) => {
  try {
    const contacts = campaignService.getContacts();
    const contact = contacts.find(c => c.id === req.params.id);
    if (!contact) return res.status(404).send('Not found');

    const slotDate = contact.scheduledSlot?.date;
    if (!slotDate) return res.status(400).send('No scheduled slot');

    const nowDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

    if (nowDate < slotDate) {
      return res.send(`<html><body style="font-family: Arial; padding: 24px;"><h2>Der Zoom-Link ist noch nicht verfügbar</h2><p>Termin: ${slotDate}</p></body></html>`);
    }

    if (!contact.zoomJoinUrl) return res.status(404).send('Meeting not ready');
    return res.redirect(contact.zoomJoinUrl);
  } catch (error) {
    res.status(500).send('Error');
  }
});

export default router;
