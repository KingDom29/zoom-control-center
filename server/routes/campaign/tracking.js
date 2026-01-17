/**
 * Campaign Tracking Routes
 * Click tracking, replies, re-engagement
 */

import express from 'express';
import { campaignService, clickTokens, getTrackingUrl } from '../../services/campaignService.js';
import emailService from '../../services/emailService.js';
import { zendeskService } from '../../services/zendeskService.js';
import logger from '../../utils/logger.js';

const router = express.Router();

// Handle email button click
router.get('/:action/:token', async (req, res) => {
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
    const ws = await import('../../utils/websocket.js');
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
  }
  
  // Invalidate token (one-time use)
  clickTokens.delete(token);
  
  // Show confirmation page based on action
  const messages = {
    'quick-call': { title: '🚀 Schnell-Termin angefordert!', body: 'Wir melden uns innerhalb von 2 Stunden bei Ihnen.' },
    'urgent': { title: '📞 Rückruf angefordert!', body: 'Wir rufen Sie so schnell wie möglich an.' },
    'book': { title: '📅 Weiterleitung...', body: 'Sie werden zu unserem Buchungstool weitergeleitet.', redirect: 'https://booking.maklerplan.com' },
    'no-interest': { title: '✅ Verstanden', body: 'Sie werden keine weiteren Nachrichten erhalten.' },
    'cancel': { title: '🚫 Termin abgesagt', body: 'Wir haben Ihre Absage erhalten.' }
  };
  
  const msg = messages[action] || { title: '✅ Aktion erfasst', body: 'Danke für Ihre Rückmeldung.' };
  
  if (msg.redirect) {
    return res.redirect(msg.redirect);
  }
  
  res.send(`
    <html>
    <head><meta charset="utf-8"><title>Maklerplan</title></head>
    <body style="font-family: Arial; text-align: center; padding: 50px; background: #f8f9fa;">
      <div style="background: white; padding: 40px; border-radius: 12px; max-width: 400px; margin: 0 auto;">
        <h2 style="color: #22c55e;">${msg.title}</h2>
        <p style="color: #666;">${msg.body}</p>
      </div>
    </body>
    </html>
  `);
});

export default router;
