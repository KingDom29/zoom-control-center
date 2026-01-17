/**
 * Meeting Summary Service
 * Automatische Zusammenfassung von Zoom Meetings
 * - Transkription abrufen
 * - KI-Zusammenfassung erstellen
 * - E-Mail senden
 */

import { zoomApi } from './zoomAuth.js';
import emailService from './emailService.js';
import logger from '../utils/logger.js';
import axios from 'axios';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SUMMARY_EMAIL = process.env.SUMMARY_EMAIL || 'de@leadquelle.ai';

class MeetingSummaryService {
  constructor() {
    this.openaiEnabled = !!OPENAI_API_KEY;
  }

  /**
   * Recording Details abrufen
   */
  async getRecordingDetails(meetingId) {
    try {
      const recording = await zoomApi('GET', `/meetings/${meetingId}/recordings`);
      return recording;
    } catch (error) {
      logger.error('Recording abrufen fehlgeschlagen', { meetingId, error: error.message });
      return null;
    }
  }

  /**
   * Transkription aus Recording extrahieren
   */
  async getTranscript(meetingId) {
    try {
      const recording = await this.getRecordingDetails(meetingId);
      if (!recording || !recording.recording_files) return null;

      // Transkript-Datei finden
      const transcriptFile = recording.recording_files.find(f => 
        f.file_type === 'TRANSCRIPT' || f.recording_type === 'audio_transcript'
      );

      if (!transcriptFile || !transcriptFile.download_url) {
        logger.warn('Keine Transkription gefunden', { meetingId });
        return null;
      }

      // Transkript herunterladen
      const response = await axios.get(transcriptFile.download_url, {
        headers: { Authorization: `Bearer ${await this.getZoomToken()}` }
      });

      return {
        text: response.data,
        meeting: {
          id: meetingId,
          topic: recording.topic,
          startTime: recording.start_time,
          duration: recording.duration,
          participants: recording.participant_count
        }
      };
    } catch (error) {
      logger.error('Transkript abrufen fehlgeschlagen', { meetingId, error: error.message });
      return null;
    }
  }

  /**
   * KI-Zusammenfassung mit OpenAI
   */
  async summarizeWithAI(transcript, meetingInfo) {
    if (!this.openaiEnabled) {
      return this.simpleSummary(transcript);
    }

    try {
      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Du bist ein Experte für Meeting-Zusammenfassungen. Erstelle eine prägnante, actionable Zusammenfassung auf Deutsch.

Format:
## 🎯 Kernaussagen (3-5 Punkte)
## ✅ Action Items
## 💡 Wichtige Erkenntnisse
## 📝 Follow-up nötig

Halte es kurz und fokussiert auf das Wesentliche.`
          },
          {
            role: 'user',
            content: `Meeting: ${meetingInfo.topic}
Dauer: ${meetingInfo.duration} Minuten
Teilnehmer: ${meetingInfo.participants}

Transkript:
${transcript.substring(0, 15000)}`
          }
        ],
        max_tokens: 1000,
        temperature: 0.3
      }, {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      return response.data.choices[0].message.content;
    } catch (error) {
      logger.error('OpenAI Zusammenfassung fehlgeschlagen', { error: error.message });
      return this.simpleSummary(transcript);
    }
  }

  /**
   * Einfache Zusammenfassung ohne KI
   */
  simpleSummary(transcript) {
    const words = transcript.split(/\s+/).length;
    const sentences = transcript.split(/[.!?]+/).filter(s => s.trim()).slice(0, 10);
    
    return `## 📝 Meeting-Notizen

**Länge:** ${words} Wörter

**Erste Aussagen:**
${sentences.map(s => `- ${s.trim()}`).join('\n')}

_Für detaillierte KI-Zusammenfassungen: OPENAI_API_KEY in Railway setzen_`;
  }

  /**
   * Zusammenfassung per E-Mail senden
   */
  async sendSummaryEmail(meetingInfo, summary) {
    const subject = `📋 Meeting-Zusammenfassung: ${meetingInfo.topic}`;
    
    const body = `
<div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px;">
    <h1 style="margin: 0;">📋 Meeting-Zusammenfassung</h1>
  </div>
  
  <div style="background: #f9fafb; padding: 20px; margin-top: 20px; border-radius: 8px;">
    <table style="width: 100%;">
      <tr><td style="padding: 5px 0;"><strong>Meeting:</strong></td><td>${meetingInfo.topic}</td></tr>
      <tr><td style="padding: 5px 0;"><strong>Datum:</strong></td><td>${new Date(meetingInfo.startTime).toLocaleString('de-DE')}</td></tr>
      <tr><td style="padding: 5px 0;"><strong>Dauer:</strong></td><td>${meetingInfo.duration} Minuten</td></tr>
      <tr><td style="padding: 5px 0;"><strong>Teilnehmer:</strong></td><td>${meetingInfo.participants || '-'}</td></tr>
    </table>
  </div>
  
  <div style="padding: 20px; margin-top: 20px; border-left: 4px solid #667eea;">
    ${summary.replace(/\n/g, '<br>').replace(/## /g, '<h3 style="margin-top: 20px;">').replace(/\*\*/g, '<strong>').replace(/\*\*/g, '</strong>')}
  </div>
  
  <p style="color: #666; font-size: 12px; margin-top: 30px; text-align: center;">
    Automatische Meeting-Zusammenfassung | Leadquelle AI
  </p>
</div>
    `;

    await emailService.sendEmail({
      to: SUMMARY_EMAIL,
      subject,
      body
    });

    logger.info(`📧 Meeting-Zusammenfassung gesendet: ${meetingInfo.topic}`);
  }

  /**
   * Kompletter Prozess: Recording → Zusammenfassung → E-Mail
   */
  async processRecording(meetingId) {
    logger.info(`🎬 Verarbeite Recording für Meeting ${meetingId}...`);

    // 1. Transkript abrufen
    const transcriptData = await this.getTranscript(meetingId);
    
    if (!transcriptData) {
      logger.warn('Kein Transkript verfügbar', { meetingId });
      return { success: false, reason: 'no_transcript' };
    }

    // 2. KI-Zusammenfassung
    const summary = await this.summarizeWithAI(transcriptData.text, transcriptData.meeting);

    // 3. E-Mail senden
    await this.sendSummaryEmail(transcriptData.meeting, summary);

    return {
      success: true,
      meeting: transcriptData.meeting,
      summaryLength: summary.length
    };
  }

  /**
   * Webhook-Handler für Meeting-Ende
   */
  async handleMeetingEnded(payload) {
    const { id, topic, duration } = payload.object;
    
    logger.info(`📞 Meeting beendet: ${topic} (${duration} min)`);

    // Warte kurz bis Recording verfügbar ist
    setTimeout(async () => {
      try {
        await this.processRecording(id);
      } catch (error) {
        logger.error('Recording-Verarbeitung fehlgeschlagen', { meetingId: id, error: error.message });
      }
    }, 60000); // 1 Minute warten

    return { queued: true, meetingId: id };
  }

  /**
   * Manuell Recording verarbeiten
   */
  async processManual(meetingId) {
    return await this.processRecording(meetingId);
  }
}

export const meetingSummaryService = new MeetingSummaryService();
export default meetingSummaryService;
