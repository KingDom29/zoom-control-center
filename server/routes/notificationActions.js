/**
 * Notification Action Routes
 * Handles actions triggered from the Conversion Center notifications
 */

import { Router } from 'express';
import logger from '../utils/logger.js';
import emailService from '../services/emailService.js';
import openaiService from '../services/openaiService.js';
import { campaignService } from '../services/campaignService.js';

const router = Router();

/**
 * POST /api/notifications/action/followup
 * Trigger follow-up email for a lead/meeting
 */
router.post('/action/followup', async (req, res) => {
  try {
    const { notificationId, eventData, useAI = false } = req.body;

    if (!eventData) {
      return res.status(400).json({ success: false, error: 'eventData required' });
    }

    const topic = eventData.data?.topic || 'Meeting';
    const participants = eventData.data?.participants || [];
    const emails = participants
      .filter(p => p.email)
      .map(p => p.email);

    if (emails.length === 0 && eventData.data?.participantEmail) {
      emails.push(eventData.data.participantEmail);
    }

    if (emails.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Keine E-Mail-Adressen gefunden' 
      });
    }

    let emailBody;
    let subject;

    if (useAI) {
      emailBody = await openaiService.generateMeetingFollowUp({
        meetingTopic: topic,
        hostName: 'Maklerplan Team',
        participants,
        duration: eventData.data?.duration || 30
      });
      subject = `Danke für Ihre Teilnahme: ${topic}`;
    } else {
      subject = `Follow-up: ${topic}`;
      emailBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
          <p>Vielen Dank für Ihre Teilnahme an "${topic}".</p>
          <p>Wir freuen uns über Ihr Interesse und stehen Ihnen für Fragen gerne zur Verfügung.</p>
          <p>Mit freundlichen Grüßen<br><strong>Ihr Maklerplan Team</strong></p>
        </div>
      `;
    }

    const result = await emailService.sendEmail({
      to: emails,
      subject,
      body: emailBody,
      isHtml: true
    });

    logger.info(`📧 Follow-up sent via notification action`, { 
      notificationId, 
      recipients: emails.length 
    });

    res.json({
      success: true,
      action: 'followup',
      recipients: emails,
      result
    });
  } catch (error) {
    logger.error('Follow-up action failed', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/notifications/action/call
 * Log call intent and create task
 */
router.post('/action/call', async (req, res) => {
  try {
    const { notificationId, eventData } = req.body;

    const contactName = eventData.data?.participantName || 
                       eventData.data?.topic || 
                       'Unbekannt';
    const contactEmail = eventData.data?.participantEmail;

    const task = {
      id: crypto.randomUUID(),
      type: 'call',
      status: 'pending',
      contact: {
        name: contactName,
        email: contactEmail
      },
      source: {
        notificationId,
        eventType: eventData.type
      },
      createdAt: new Date().toISOString(),
      dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    };

    logger.info(`📞 Call task created via notification action`, { task });

    res.json({
      success: true,
      action: 'call',
      task,
      message: `Anruf-Aufgabe für ${contactName} erstellt`
    });
  } catch (error) {
    logger.error('Call action failed', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/notifications/action/schedule
 * Create meeting scheduling task
 */
router.post('/action/schedule', async (req, res) => {
  try {
    const { notificationId, eventData, preferredDate } = req.body;

    const contactName = eventData.data?.participantName || 'Lead';
    const topic = eventData.data?.topic || 'Follow-up Meeting';

    const task = {
      id: crypto.randomUUID(),
      type: 'schedule',
      status: 'pending',
      meeting: {
        topic: `Folgetermin: ${topic}`,
        contact: contactName,
        preferredDate
      },
      source: {
        notificationId,
        eventType: eventData.type
      },
      createdAt: new Date().toISOString()
    };

    logger.info(`📅 Schedule task created via notification action`, { task });

    res.json({
      success: true,
      action: 'schedule',
      task,
      message: `Terminplanung für ${contactName} erstellt`
    });
  } catch (error) {
    logger.error('Schedule action failed', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/notifications/action/reschedule
 * Handle no-show reschedule
 */
router.post('/action/reschedule', async (req, res) => {
  try {
    const { notificationId, eventData } = req.body;

    const meetingId = eventData.data?.meetingId;
    const topic = eventData.data?.topic || 'Meeting';

    const task = {
      id: crypto.randomUUID(),
      type: 'reschedule',
      status: 'pending',
      originalMeetingId: meetingId,
      topic,
      reason: 'no_show',
      createdAt: new Date().toISOString()
    };

    logger.info(`🔄 Reschedule task created for no-show`, { task });

    res.json({
      success: true,
      action: 'reschedule',
      task,
      message: `Termin "${topic}" wird neu geplant`
    });
  } catch (error) {
    logger.error('Reschedule action failed', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/notifications/action/demo
 * Schedule demo request
 */
router.post('/action/demo', async (req, res) => {
  try {
    const { notificationId, eventData } = req.body;

    const contactName = eventData.data?.participantName || 'Interessent';
    const contactEmail = eventData.data?.participantEmail;

    const task = {
      id: crypto.randomUUID(),
      type: 'demo',
      status: 'pending',
      contact: {
        name: contactName,
        email: contactEmail
      },
      priority: 'high',
      createdAt: new Date().toISOString(),
      dueAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
    };

    logger.info(`🎯 Demo request created via notification action`, { task });

    res.json({
      success: true,
      action: 'demo',
      task,
      message: `Demo für ${contactName} geplant`
    });
  } catch (error) {
    logger.error('Demo action failed', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/notifications/action/report
 * Mark event for reporting
 */
router.post('/action/report', async (req, res) => {
  try {
    const { notificationId, eventData } = req.body;

    logger.info(`📊 Event marked for report`, { 
      notificationId, 
      eventType: eventData.type 
    });

    res.json({
      success: true,
      action: 'report',
      message: 'Event für Report markiert'
    });
  } catch (error) {
    logger.error('Report action failed', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/notifications/actions/stats
 * Get action statistics
 */
router.get('/actions/stats', (req, res) => {
  res.json({
    success: true,
    stats: {
      actionsAvailable: ['followup', 'call', 'schedule', 'reschedule', 'demo', 'report'],
      description: {
        followup: 'E-Mail Follow-up senden',
        call: 'Anruf-Aufgabe erstellen',
        schedule: 'Termin planen',
        reschedule: 'No-Show neu terminieren',
        demo: 'Demo planen',
        report: 'Für Report markieren'
      }
    }
  });
});

export default router;
