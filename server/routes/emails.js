/**
 * Email API Routes
 * E-Mail Outreach und Follow-Up für Makler
 */

import express from 'express';
import { emailService, EMAIL_TEMPLATES } from '../services/emailService.js';
import { leadDatabase } from '../services/leadDatabase.js';
import logger from '../utils/logger.js';

const router = express.Router();

// GET /api/emails/templates - Alle E-Mail Templates
router.get('/templates', (req, res) => {
  const templates = Object.values(EMAIL_TEMPLATES).map(t => ({
    id: t.id,
    name: t.name,
    subject: t.subject,
    preview: t.body.substring(0, 200) + '...'
  }));
  res.json({ success: true, templates });
});

// GET /api/emails/templates/:id - Einzelnes Template
router.get('/templates/:id', (req, res) => {
  const template = EMAIL_TEMPLATES[req.params.id];
  if (!template) {
    return res.status(404).json({ success: false, error: 'Template nicht gefunden' });
  }
  res.json({ success: true, template });
});

// POST /api/emails/send - Einzelne E-Mail senden
router.post('/send', async (req, res) => {
  try {
    const { to, subject, body, isHtml = true, cc, bcc } = req.body;

    if (!to || !subject || !body) {
      return res.status(400).json({ 
        success: false, 
        error: 'to, subject und body sind erforderlich' 
      });
    }

    const result = await emailService.sendEmail({ to, subject, body, isHtml, cc, bcc });
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('Send email error', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/emails/send-template - E-Mail mit Template senden
router.post('/send-template', async (req, res) => {
  try {
    const { to, templateId, variables = {}, cc, bcc } = req.body;

    if (!to || !templateId) {
      return res.status(400).json({ 
        success: false, 
        error: 'to und templateId sind erforderlich' 
      });
    }

    const result = await emailService.sendTemplateEmail({ to, templateId, variables, cc, bcc });
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('Send template email error', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/emails/send-to-lead/:leadId - E-Mail an Lead senden
router.post('/send-to-lead/:leadId', async (req, res) => {
  try {
    const { templateId, variables = {}, customSubject, customBody } = req.body;
    const lead = leadDatabase.getLeadById(req.params.leadId);

    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead nicht gefunden' });
    }

    const email = lead.contactEmail || lead.email;
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        error: 'Lead hat keine E-Mail-Adresse' 
      });
    }

    // Lead-Daten als Variablen
    const leadVariables = {
      company: lead.company || lead.name,
      contact_name: lead.contactPerson || 'Damen und Herren',
      location: lead.address,
      rating_text: lead.rating ? `Ihrer ${lead.rating}-Sterne-Bewertung` : 'Ihrer Präsenz',
      website: lead.website,
      phone: lead.phone,
      // Sender defaults (können überschrieben werden)
      sender_name: 'Ihr Maklerplan Team',
      sender_phone: '',
      ...variables
    };

    let result;
    if (templateId) {
      result = await emailService.sendTemplateEmail({ 
        to: email, 
        templateId, 
        variables: leadVariables 
      });
    } else if (customSubject && customBody) {
      const subject = emailService.replaceVariables(customSubject, leadVariables);
      const body = emailService.replaceVariables(customBody, leadVariables);
      result = await emailService.sendEmail({ to: email, subject, body });
    } else {
      return res.status(400).json({ 
        success: false, 
        error: 'templateId oder customSubject+customBody erforderlich' 
      });
    }

    // Activity zum Lead hinzufügen
    leadDatabase.addNote(req.params.leadId, `📧 E-Mail gesendet: "${result.subject}"`);
    
    // Status aktualisieren wenn noch "new"
    if (lead.status === 'new') {
      leadDatabase.updateStatus(req.params.leadId, 'contacted');
    }

    res.json({ 
      success: true, 
      ...result,
      lead: leadDatabase.getLeadById(req.params.leadId)
    });
  } catch (error) {
    logger.error('Send to lead error', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/emails/bulk-outreach - Bulk-E-Mails an mehrere Leads
router.post('/bulk-outreach', async (req, res) => {
  try {
    const { leadIds, templateId, variables = {}, delayMs = 2000 } = req.body;

    if (!leadIds || !Array.isArray(leadIds) || !templateId) {
      return res.status(400).json({ 
        success: false, 
        error: 'leadIds Array und templateId erforderlich' 
      });
    }

    const template = EMAIL_TEMPLATES[templateId];
    if (!template) {
      return res.status(404).json({ success: false, error: 'Template nicht gefunden' });
    }

    const results = {
      sent: [],
      failed: [],
      skipped: []
    };

    for (const leadId of leadIds) {
      const lead = leadDatabase.getLeadById(leadId);
      
      if (!lead) {
        results.skipped.push({ leadId, reason: 'Lead nicht gefunden' });
        continue;
      }

      const email = lead.contactEmail || lead.email;
      if (!email) {
        results.skipped.push({ leadId, name: lead.name, reason: 'Keine E-Mail' });
        continue;
      }

      try {
        const leadVariables = {
          company: lead.company || lead.name,
          contact_name: lead.contactPerson || 'Damen und Herren',
          location: lead.address,
          rating_text: lead.rating ? `Ihrer ${lead.rating}-Sterne-Bewertung` : 'Ihrer Präsenz',
          ...variables
        };

        await emailService.sendTemplateEmail({ 
          to: email, 
          templateId, 
          variables: leadVariables 
        });

        // Lead aktualisieren
        leadDatabase.addNote(leadId, `📧 Outreach E-Mail gesendet: "${template.name}"`);
        if (lead.status === 'new') {
          leadDatabase.updateStatus(leadId, 'contacted');
        }

        results.sent.push({ leadId, name: lead.name, email });

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, delayMs));
      } catch (error) {
        results.failed.push({ leadId, name: lead.name, email, error: error.message });
      }
    }

    res.json({
      success: true,
      summary: {
        total: leadIds.length,
        sent: results.sent.length,
        failed: results.failed.length,
        skipped: results.skipped.length
      },
      results
    });
  } catch (error) {
    logger.error('Bulk outreach error', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/emails/meeting-invitation/:leadId - Meeting-Einladung senden
router.post('/meeting-invitation/:leadId', async (req, res) => {
  try {
    const { meetingId, variables = {} } = req.body;
    const lead = leadDatabase.getLeadById(req.params.leadId);

    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead nicht gefunden' });
    }

    const email = lead.contactEmail || lead.email;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Lead hat keine E-Mail' });
    }

    // Meeting aus Lead holen
    const meeting = lead.meetings.find(m => m.id === meetingId || m.zoomMeetingId === meetingId);
    if (!meeting) {
      return res.status(404).json({ success: false, error: 'Meeting nicht gefunden' });
    }

    const meetingDate = new Date(meeting.scheduledAt);
    const meetingVariables = {
      company: lead.company || lead.name,
      contact_name: lead.contactPerson || 'Damen und Herren',
      meeting_date: meetingDate.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
      meeting_time: meetingDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
      meeting_duration: meeting.duration,
      join_url: meeting.joinUrl,
      ...variables
    };

    const result = await emailService.sendTemplateEmail({
      to: email,
      templateId: 'termineinladung',
      variables: meetingVariables
    });

    leadDatabase.addNote(req.params.leadId, `📧 Meeting-Einladung gesendet für ${meetingDate.toLocaleDateString('de-DE')}`);

    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('Meeting invitation error', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/emails/status - Service Status
router.get('/status', async (req, res) => {
  try {
    await emailService.initialize();
    res.json({
      success: true,
      initialized: emailService.initialized,
      fromEmail: emailService.fromEmail,
      templatesAvailable: Object.keys(EMAIL_TEMPLATES).length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================
// INBOX & REPLY TRACKING
// =============================================

// GET /api/emails/inbox - Inbox-Nachrichten abrufen
router.get('/inbox', async (req, res) => {
  try {
    const { limit = 50, folder = 'inbox' } = req.query;
    const messages = await emailService.getInboxMessages({ 
      folder, 
      limit: parseInt(limit) 
    });
    res.json({ 
      success: true, 
      count: messages.length,
      messages 
    });
  } catch (error) {
    logger.error('Inbox read error', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/emails/inbox/:id - Einzelne E-Mail mit Body
router.get('/inbox/:id', async (req, res) => {
  try {
    const message = await emailService.getMessage(req.params.id);
    res.json({ success: true, message });
  } catch (error) {
    logger.error('Get message error', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/emails/campaign-replies - Antworten auf Kampagne
router.get('/campaign-replies', async (req, res) => {
  try {
    const { since } = req.query;
    
    // Kampagnen-Daten laden
    const fs = await import('fs');
    const path = await import('path');
    const campaignPath = path.join(process.cwd(), 'server/data/campaign.json');
    const campaign = JSON.parse(fs.readFileSync(campaignPath, 'utf8'));
    
    // Kontakt-Emails extrahieren
    const contactEmails = campaign.contacts
      .map(c => c.email)
      .filter(Boolean);
    
    // Antworten abrufen
    const result = await emailService.getCampaignReplies(contactEmails, since);
    
    // Mit Kontakt-Daten anreichern
    const emailToContact = {};
    campaign.contacts.forEach(c => {
      if (c.email) emailToContact[c.email.toLowerCase()] = {
        id: c.id,
        name: `${c.vorname} ${c.nachname}`.trim(),
        firma: c.firma,
        status: c.status,
        attendanceStatus: c.attendanceStatus
      };
    });
    
    const enrichedReplies = result.replies.map(r => ({
      ...r,
      contact: emailToContact[r.from?.toLowerCase()] || null
    }));
    
    res.json({
      success: true,
      totalInbox: result.total,
      campaignReplies: result.campaignReplies,
      replies: enrichedReplies
    });
  } catch (error) {
    logger.error('Campaign replies error', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/emails/reply-stats - Antwort-Statistiken
router.get('/reply-stats', async (req, res) => {
  try {
    const fs = await import('fs');
    const path = await import('path');
    const campaignPath = path.join(process.cwd(), 'server/data/campaign.json');
    const campaign = JSON.parse(fs.readFileSync(campaignPath, 'utf8'));
    
    const contactEmails = campaign.contacts.map(c => c.email).filter(Boolean);
    const result = await emailService.getCampaignReplies(contactEmails);
    
    // Kategorisierung nach Betreff
    const categories = {
      confirmation: 0,
      reschedule: 0,
      cancel: 0,
      question: 0,
      other: 0
    };
    
    result.replies.forEach(r => {
      const subject = (r.subject || '').toLowerCase();
      if (subject.includes('bestätig') || subject.includes('confirm')) categories.confirmation++;
      else if (subject.includes('verschie') || subject.includes('termin')) categories.reschedule++;
      else if (subject.includes('absag') || subject.includes('cancel')) categories.cancel++;
      else if (subject.includes('frage') || subject.includes('?')) categories.question++;
      else categories.other++;
    });
    
    res.json({
      success: true,
      stats: {
        totalContacts: campaign.contacts.length,
        invitationsSent: campaign.contacts.filter(c => c.invitationSentAt).length,
        repliesReceived: result.campaignReplies,
        replyRate: ((result.campaignReplies / campaign.contacts.length) * 100).toFixed(2) + '%',
        categories
      }
    });
  } catch (error) {
    logger.error('Reply stats error', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
