/**
 * Campaign Contacts Routes
 * Contact management, import, stats
 */

import express from 'express';
import path from 'path';
import { campaignService } from '../../services/campaignService.js';

const router = express.Router();

// Get all contacts
router.get('/', async (req, res) => {
  try {
    const { status, search } = req.query;
    const contacts = campaignService.getContacts({ status, search });
    res.json({ total: contacts.length, contacts });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single contact
router.get('/:id', async (req, res) => {
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

// Get ICS calendar for a contact
router.get('/:id/calendar.ics', async (req, res) => {
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

// Get contacts by attendance status
router.get('/attendance/:status', async (req, res) => {
  try {
    const { status } = req.params;
    const validStatuses = ['attended', 'no_show', 'partial'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Valid: ${validStatuses.join(', ')}` });
    }

    const allContacts = campaignService.getContacts();
    const contacts = allContacts.filter(c => c.attendanceStatus === status);
    res.json({ total: contacts.length, contacts });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all no-shows
router.get('/status/no_show', async (req, res) => {
  try {
    const contacts = campaignService.getContacts({ status: 'invitation_sent' })
      .filter(c => c.attendanceStatus === 'no_show');
    res.json({ total: contacts.length, contacts });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
