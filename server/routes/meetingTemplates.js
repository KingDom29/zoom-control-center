/**
 * Meeting Templates API Routes
 * Vorlagen für verschiedene Meeting-Typen
 */

import express from 'express';
import { zoomApi } from '../services/zoomAuth.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Vordefinierte Meeting Templates
const MEETING_TEMPLATES = {
  erstgespraech: {
    id: 'erstgespraech',
    name: 'Erstgespräch',
    description: 'Erstes Kennenlernen mit potenziellem Makler-Partner',
    duration: 30,
    settings: {
      host_video: true,
      participant_video: true,
      join_before_host: false,
      mute_upon_entry: false,
      waiting_room: true,
      auto_recording: 'cloud',
      meeting_authentication: false
    },
    agenda: `📋 Agenda Erstgespräch

1. Begrüßung & Vorstellung (5 min)
2. Vorstellung Maklerplan (10 min)
3. Aktuelle Situation des Maklers (10 min)
4. Nächste Schritte (5 min)

📌 Ziel: Interesse wecken, Folgetermin vereinbaren`
  },
  
  besichtigung: {
    id: 'besichtigung',
    name: 'Virtuelle Besichtigung',
    description: 'Online-Besichtigung einer Immobilie',
    duration: 60,
    settings: {
      host_video: true,
      participant_video: true,
      join_before_host: false,
      mute_upon_entry: true,
      waiting_room: true,
      auto_recording: 'cloud',
      meeting_authentication: false
    },
    agenda: `🏠 Agenda Virtuelle Besichtigung

1. Begrüßung (5 min)
2. Überblick Objekt (10 min)
3. Detaillierte Besichtigung (30 min)
4. Fragen & Antworten (10 min)
5. Nächste Schritte (5 min)`
  },
  
  produktdemo: {
    id: 'produktdemo',
    name: 'Produktdemo',
    description: 'Detaillierte Demonstration der Maklerplan-Features',
    duration: 45,
    settings: {
      host_video: true,
      participant_video: true,
      join_before_host: false,
      mute_upon_entry: false,
      waiting_room: true,
      auto_recording: 'cloud',
      meeting_authentication: false
    },
    agenda: `🖥️ Agenda Produktdemo

1. Kurze Wiederholung Situation (5 min)
2. Live-Demo Hauptfeatures (25 min)
3. Q&A (10 min)
4. Preise & Pakete (5 min)

🎯 Ziel: Überzeugung, Abschluss vorbereiten`
  },
  
  abschluss: {
    id: 'abschluss',
    name: 'Abschlussgespräch',
    description: 'Vertragsabschluss und Onboarding',
    duration: 45,
    settings: {
      host_video: true,
      participant_video: true,
      join_before_host: false,
      mute_upon_entry: false,
      waiting_room: true,
      auto_recording: 'cloud',
      meeting_authentication: false
    },
    agenda: `✍️ Agenda Abschlussgespräch

1. Zusammenfassung Angebot (5 min)
2. Letzte Fragen klären (10 min)
3. Vertragsbesprechung (15 min)
4. Onboarding-Plan (10 min)
5. Nächste Schritte (5 min)

🎉 Ziel: Vertragsunterzeichnung`
  },
  
  support: {
    id: 'support',
    name: 'Support-Call',
    description: 'Technischer Support oder Problemlösung',
    duration: 30,
    settings: {
      host_video: true,
      participant_video: false,
      join_before_host: false,
      mute_upon_entry: false,
      waiting_room: false,
      auto_recording: 'local',
      meeting_authentication: false
    },
    agenda: `🔧 Support-Call

1. Problem beschreiben (5 min)
2. Analyse & Lösung (20 min)
3. Zusammenfassung (5 min)`
  },
  
  webinar: {
    id: 'webinar',
    name: 'Webinar',
    description: 'Gruppen-Webinar für mehrere Teilnehmer',
    duration: 60,
    settings: {
      host_video: true,
      participant_video: false,
      join_before_host: false,
      mute_upon_entry: true,
      waiting_room: true,
      auto_recording: 'cloud',
      meeting_authentication: false
    },
    agenda: `📺 Webinar Agenda

1. Intro & Housekeeping (5 min)
2. Hauptpräsentation (40 min)
3. Q&A Session (15 min)

💡 Interaktiv: Nutze Polls & Chat`
  }
};

// GET /api/meeting-templates - Alle Templates abrufen
router.get('/', (req, res) => {
  res.json({
    success: true,
    templates: Object.values(MEETING_TEMPLATES)
  });
});

// GET /api/meeting-templates/:id - Einzelnes Template
router.get('/:id', (req, res) => {
  const template = MEETING_TEMPLATES[req.params.id];
  if (!template) {
    return res.status(404).json({ success: false, error: 'Template nicht gefunden' });
  }
  res.json({ success: true, template });
});

// POST /api/meeting-templates/:id/create-meeting - Meeting aus Template erstellen
router.post('/:id/create-meeting', async (req, res) => {
  try {
    const template = MEETING_TEMPLATES[req.params.id];
    if (!template) {
      return res.status(404).json({ success: false, error: 'Template nicht gefunden' });
    }

    const { 
      topic,
      startTime,
      attendeeEmail,
      attendeeName,
      leadId,
      customAgenda
    } = req.body;

    if (!topic) {
      return res.status(400).json({ success: false, error: 'Topic erforderlich' });
    }

    // Meeting erstellen via Zoom API
    const meetingData = {
      topic: topic,
      type: startTime ? 2 : 1, // 2 = scheduled, 1 = instant
      start_time: startTime,
      duration: template.duration,
      timezone: 'Europe/Berlin',
      agenda: customAgenda || template.agenda,
      settings: {
        ...template.settings,
        contact_email: attendeeEmail || undefined,
        contact_name: attendeeName || undefined
      }
    };

    const meeting = await zoomApi('POST', '/users/me/meetings', meetingData);

    res.status(201).json({
      success: true,
      meeting: {
        id: meeting.id,
        topic: meeting.topic,
        join_url: meeting.join_url,
        start_url: meeting.start_url,
        password: meeting.password,
        start_time: meeting.start_time,
        duration: meeting.duration,
        template: template.id,
        leadId: leadId || null
      }
    });
  } catch (error) {
    logger.error('Create meeting error', { error: error.message, details: error.response?.data });
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/meeting-templates/:id/create-for-lead - Meeting für Lead erstellen
router.post('/:id/create-for-lead', async (req, res) => {
  try {
    const template = MEETING_TEMPLATES[req.params.id];
    if (!template) {
      return res.status(404).json({ success: false, error: 'Template nicht gefunden' });
    }

    const { leadId, startTime } = req.body;
    
    if (!leadId) {
      return res.status(400).json({ success: false, error: 'leadId erforderlich' });
    }

    // Lead aus Datenbank holen
    const { leadDatabase } = await import('../services/leadDatabase.js');
    const lead = leadDatabase.getLeadById(leadId);
    
    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead nicht gefunden' });
    }

    // Meeting erstellen
    const topic = `${template.name} - ${lead.company}`;
    const agenda = `${template.agenda}\n\n---\n📧 Kontakt: ${lead.contactEmail || lead.email || 'N/A'}\n📞 Tel: ${lead.phone || 'N/A'}\n🌐 Web: ${lead.website || 'N/A'}`;

    const meetingData = {
      topic: topic,
      type: startTime ? 2 : 1,
      start_time: startTime,
      duration: template.duration,
      timezone: 'Europe/Berlin',
      agenda: agenda,
      settings: template.settings
    };

    const meeting = await zoomApi('POST', '/users/me/meetings', meetingData);

    // Meeting zum Lead hinzufügen
    leadDatabase.addMeeting(leadId, {
      zoomMeetingId: meeting.id,
      topic: meeting.topic,
      type: template.id,
      scheduledAt: meeting.start_time || new Date().toISOString(),
      duration: meeting.duration,
      joinUrl: meeting.join_url
    });

    res.status(201).json({
      success: true,
      meeting: {
        id: meeting.id,
        topic: meeting.topic,
        join_url: meeting.join_url,
        start_url: meeting.start_url,
        password: meeting.password,
        start_time: meeting.start_time,
        duration: meeting.duration,
        template: template.id,
        leadId: leadId
      },
      lead: leadDatabase.getLeadById(leadId)
    });
  } catch (error) {
    logger.error('Create meeting for lead error', { error: error.message, details: error.response?.data });
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
