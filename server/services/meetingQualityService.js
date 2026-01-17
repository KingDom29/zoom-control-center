/**
 * Meeting Quality & Productivity Service
 * - Meeting-Qualitäts-Score
 * - No-Show Alerts
 * - Produktivitäts-Tracking
 * - Automatische Reminder
 */

import { zoomApi } from './zoomAuth.js';
import { emailService } from './emailService.js';
import logger from '../utils/logger.js';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'de@maklerplan.com';

class MeetingQualityService {

  /**
   * Meeting-Qualitäts-Score berechnen (0-100)
   */
  calculateQualityScore(meeting) {
    let score = 0;
    const factors = [];

    // 1. Dauer (max 25 Punkte)
    // Optimal: 15-45 Minuten
    const duration = meeting.duration || 0;
    if (duration >= 15 && duration <= 45) {
      score += 25;
      factors.push({ name: 'Optimale Dauer', points: 25 });
    } else if (duration >= 10 && duration <= 60) {
      score += 15;
      factors.push({ name: 'Akzeptable Dauer', points: 15 });
    } else if (duration > 0) {
      score += 5;
      factors.push({ name: 'Kurzes/Langes Meeting', points: 5 });
    }

    // 2. Teilnehmer (max 25 Punkte)
    const participants = meeting.participants_count || meeting.participants || 1;
    if (participants >= 2 && participants <= 5) {
      score += 25;
      factors.push({ name: 'Ideale Teilnehmerzahl', points: 25 });
    } else if (participants > 5 && participants <= 10) {
      score += 20;
      factors.push({ name: 'Gute Teilnehmerzahl', points: 20 });
    } else if (participants > 10) {
      score += 15;
      factors.push({ name: 'Großes Meeting', points: 15 });
    } else {
      score += 5;
      factors.push({ name: 'Solo-Meeting', points: 5 });
    }

    // 3. Recording vorhanden (max 25 Punkte)
    if (meeting.has_recording || meeting.recording_count > 0) {
      score += 25;
      factors.push({ name: 'Recording vorhanden', points: 25 });
    }

    // 4. Pünktlichkeit / Keine Abbrüche (max 25 Punkte)
    // Wenn Meeting normal beendet wurde
    if (meeting.end_time && meeting.start_time) {
      const expectedEnd = new Date(meeting.start_time).getTime() + (meeting.duration * 60 * 1000);
      const actualEnd = new Date(meeting.end_time).getTime();
      const diff = Math.abs(actualEnd - expectedEnd);
      
      if (diff < 5 * 60 * 1000) { // Weniger als 5 Min Abweichung
        score += 25;
        factors.push({ name: 'Planmäßig beendet', points: 25 });
      } else if (diff < 15 * 60 * 1000) {
        score += 15;
        factors.push({ name: 'Leichte Abweichung', points: 15 });
      } else {
        score += 5;
        factors.push({ name: 'Starke Abweichung', points: 5 });
      }
    } else {
      score += 10;
      factors.push({ name: 'Keine Zeitdaten', points: 10 });
    }

    return {
      score: Math.min(100, score),
      grade: this.getGrade(score),
      factors
    };
  }

  /**
   * Note basierend auf Score
   */
  getGrade(score) {
    if (score >= 90) return { letter: 'A+', label: 'Exzellent', color: '#22c55e' };
    if (score >= 80) return { letter: 'A', label: 'Sehr gut', color: '#22c55e' };
    if (score >= 70) return { letter: 'B', label: 'Gut', color: '#84cc16' };
    if (score >= 60) return { letter: 'C', label: 'Befriedigend', color: '#eab308' };
    if (score >= 50) return { letter: 'D', label: 'Ausreichend', color: '#f97316' };
    return { letter: 'F', label: 'Mangelhaft', color: '#ef4444' };
  }

  /**
   * Meetings eines Users mit Qualitäts-Score abrufen
   */
  async getUserMeetingsWithScore(userId, fromDate, toDate) {
    try {
      const from = fromDate || this.getDateString(-7);
      const to = toDate || this.getDateString(0);

      const response = await zoomApi('GET', `/report/users/${userId}/meetings?from=${from}&to=${to}`);
      const meetings = response.meetings || [];

      const scoredMeetings = meetings.map(m => ({
        ...m,
        quality: this.calculateQualityScore(m)
      }));

      const avgScore = scoredMeetings.length > 0
        ? Math.round(scoredMeetings.reduce((sum, m) => sum + m.quality.score, 0) / scoredMeetings.length)
        : 0;

      return {
        userId,
        period: { from, to },
        meetings: scoredMeetings,
        summary: {
          total: scoredMeetings.length,
          averageScore: avgScore,
          averageGrade: this.getGrade(avgScore),
          excellent: scoredMeetings.filter(m => m.quality.score >= 80).length,
          good: scoredMeetings.filter(m => m.quality.score >= 60 && m.quality.score < 80).length,
          needsImprovement: scoredMeetings.filter(m => m.quality.score < 60).length
        }
      };
    } catch (error) {
      logger.error('User Meetings Score Fehler', { userId, error: error.message });
      throw error;
    }
  }

  /**
   * No-Show Detection - Prüft ob Teilnehmer nicht erschienen sind
   */
  async checkNoShows() {
    try {
      // Meetings der letzten 24 Stunden prüfen
      const from = this.getDateString(-1);
      const to = this.getDateString(0);

      const usersResponse = await zoomApi('GET', '/users?status=active&page_size=300');
      const users = usersResponse.users || [];

      const noShows = [];

      for (const user of users) {
        try {
          const meetingsResponse = await zoomApi('GET', `/report/users/${user.id}/meetings?from=${from}&to=${to}`);
          const meetings = meetingsResponse.meetings || [];

          for (const meeting of meetings) {
            // Prüfe ob Meeting geplant war aber niemand kam
            if (meeting.participants_count === 0 || meeting.participants_count === 1) {
              // Hole Meeting-Details für mehr Info
              const details = await zoomApi('GET', `/past_meetings/${meeting.uuid}`).catch(() => null);
              
              if (details && details.participants_count <= 1) {
                noShows.push({
                  meeting: {
                    id: meeting.id,
                    uuid: meeting.uuid,
                    topic: meeting.topic,
                    startTime: meeting.start_time,
                    duration: meeting.duration,
                    participantsExpected: meeting.total_size || 'Unbekannt',
                    participantsActual: meeting.participants_count
                  },
                  host: {
                    id: user.id,
                    name: `${user.first_name} ${user.last_name}`,
                    email: user.email
                  },
                  type: meeting.participants_count === 0 ? 'complete_no_show' : 'partial_no_show'
                });
              }
            }
          }
        } catch (error) {
          // Skip user on error
        }
      }

      return { noShows, checked: users.length, timestamp: new Date().toISOString() };
    } catch (error) {
      logger.error('No-Show Check Fehler', { error: error.message });
      throw error;
    }
  }

  /**
   * No-Show Alert per E-Mail senden
   */
  async sendNoShowAlert(noShow) {
    try {
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #ef4444;">⚠️ No-Show Alert</h1>
          
          <div style="background: #fef2f2; padding: 20px; border-radius: 8px; border-left: 4px solid #ef4444;">
            <h2 style="margin-top: 0;">Meeting ohne Teilnehmer</h2>
            <table style="width: 100%;">
              <tr>
                <td><strong>Meeting:</strong></td>
                <td>${noShow.meeting.topic}</td>
              </tr>
              <tr>
                <td><strong>Host:</strong></td>
                <td>${noShow.host.name} (${noShow.host.email})</td>
              </tr>
              <tr>
                <td><strong>Zeit:</strong></td>
                <td>${new Date(noShow.meeting.startTime).toLocaleString('de-DE')}</td>
              </tr>
              <tr>
                <td><strong>Teilnehmer:</strong></td>
                <td>${noShow.meeting.participantsActual} von ${noShow.meeting.participantsExpected}</td>
              </tr>
              <tr>
                <td><strong>Typ:</strong></td>
                <td style="color: #ef4444; font-weight: bold;">
                  ${noShow.type === 'complete_no_show' ? 'Kompletter No-Show' : 'Teilweiser No-Show'}
                </td>
              </tr>
            </table>
          </div>
          
          <p style="color: #666; margin-top: 20px;">
            💡 <strong>Empfehlung:</strong> Kontaktiere den Host oder prüfe ob das Meeting verschoben werden muss.
          </p>
          
          <p style="color: #999; font-size: 12px; margin-top: 30px;">
            Automatisch generiert • Zoom Control Center
          </p>
        </div>
      `;

      await emailService.sendEmail({
        to: ADMIN_EMAIL,
        subject: `⚠️ No-Show: ${noShow.meeting.topic} - ${noShow.host.name}`,
        html
      });

      logger.info('No-Show Alert gesendet', { meeting: noShow.meeting.topic, host: noShow.host.email });
      return { success: true };
    } catch (error) {
      logger.error('No-Show Alert Fehler', { error: error.message });
      throw error;
    }
  }

  /**
   * Produktivitäts-Check - User ohne Meetings heute
   */
  async getInactiveUsers() {
    try {
      const today = this.getDateString(0);
      
      const usersResponse = await zoomApi('GET', '/users?status=active&page_size=300');
      const users = usersResponse.users || [];

      const userActivity = await Promise.all(users.map(async (user) => {
        try {
          const meetings = await zoomApi('GET', `/report/users/${user.id}/meetings?from=${today}&to=${today}`);
          return {
            user: {
              id: user.id,
              name: `${user.first_name} ${user.last_name}`,
              email: user.email
            },
            meetingsToday: meetings.meetings?.length || 0,
            isActive: (meetings.meetings?.length || 0) > 0
          };
        } catch {
          return {
            user: { id: user.id, name: `${user.first_name} ${user.last_name}`, email: user.email },
            meetingsToday: 0,
            isActive: false
          };
        }
      }));

      const inactive = userActivity.filter(u => !u.isActive);
      const active = userActivity.filter(u => u.isActive);

      return {
        date: today,
        summary: {
          total: users.length,
          active: active.length,
          inactive: inactive.length,
          activityRate: Math.round((active.length / users.length) * 100)
        },
        inactiveUsers: inactive,
        activeUsers: active
      };
    } catch (error) {
      logger.error('Inactive Users Check Fehler', { error: error.message });
      throw error;
    }
  }

  /**
   * Reminder an inaktive User senden
   */
  async sendInactivityReminder(user) {
    try {
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1a73e8;">👋 Hallo ${user.name.split(' ')[0]}!</h1>
          
          <div style="background: #f0f9ff; padding: 20px; border-radius: 8px;">
            <p style="font-size: 16px; margin: 0;">
              Uns ist aufgefallen, dass du heute noch <strong>kein Meeting</strong> hattest.
            </p>
          </div>
          
          <div style="margin-top: 20px;">
            <p>Falls du Unterstützung bei der Terminplanung brauchst oder Fragen hast, melde dich gerne!</p>
            
            <p style="margin-top: 20px;">
              <strong>Tipps für produktive Meetings:</strong>
            </p>
            <ul>
              <li>Plane Meetings mit klarer Agenda</li>
              <li>Halte Meetings zwischen 15-45 Minuten</li>
              <li>Aktiviere Recording für wichtige Calls</li>
            </ul>
          </div>
          
          <p style="color: #999; font-size: 12px; margin-top: 30px;">
            Diese Nachricht wurde automatisch generiert • Zoom Control Center
          </p>
        </div>
      `;

      await emailService.sendEmail({
        to: user.email,
        subject: `👋 Erinnerung: Heute noch keine Meetings geplant?`,
        html
      });

      logger.info('Inaktivitäts-Reminder gesendet', { user: user.email });
      return { success: true, sentTo: user.email };
    } catch (error) {
      logger.error('Inaktivitäts-Reminder Fehler', { error: error.message });
      throw error;
    }
  }

  /**
   * Alle inaktiven User benachrichtigen
   */
  async sendAllInactivityReminders() {
    try {
      const { inactiveUsers } = await this.getInactiveUsers();
      
      const results = [];
      for (const { user } of inactiveUsers) {
        try {
          await this.sendInactivityReminder(user);
          results.push({ user: user.email, sent: true });
        } catch (error) {
          results.push({ user: user.email, sent: false, error: error.message });
        }
      }

      return {
        totalInactive: inactiveUsers.length,
        remindersSent: results.filter(r => r.sent).length,
        results
      };
    } catch (error) {
      logger.error('Bulk Reminder Fehler', { error: error.message });
      throw error;
    }
  }

  /**
   * Produktivitäts-Report für Admin
   */
  async sendProductivityReport() {
    try {
      const activity = await this.getInactiveUsers();
      const noShows = await this.checkNoShows();

      const activeHtml = activity.activeUsers.map(u => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${u.user.name}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${u.user.email}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center; color: #22c55e;">
            ✅ ${u.meetingsToday} Meetings
          </td>
        </tr>
      `).join('');

      const inactiveHtml = activity.inactiveUsers.map(u => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${u.user.name}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${u.user.email}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center; color: #ef4444;">
            ❌ Keine Meetings
          </td>
        </tr>
      `).join('');

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
          <h1 style="color: #1a73e8;">📊 Täglicher Produktivitäts-Report</h1>
          <p style="color: #666;">Stand: ${new Date().toLocaleString('de-DE')}</p>
          
          <div style="display: flex; gap: 20px; margin: 20px 0;">
            <div style="background: #f0fdf4; padding: 20px; border-radius: 8px; flex: 1; text-align: center;">
              <div style="font-size: 32px; font-weight: bold; color: #22c55e;">${activity.summary.active}</div>
              <div style="color: #666;">Aktive User</div>
            </div>
            <div style="background: #fef2f2; padding: 20px; border-radius: 8px; flex: 1; text-align: center;">
              <div style="font-size: 32px; font-weight: bold; color: #ef4444;">${activity.summary.inactive}</div>
              <div style="color: #666;">Inaktive User</div>
            </div>
            <div style="background: #f0f9ff; padding: 20px; border-radius: 8px; flex: 1; text-align: center;">
              <div style="font-size: 32px; font-weight: bold; color: #1a73e8;">${activity.summary.activityRate}%</div>
              <div style="color: #666;">Aktivitätsrate</div>
            </div>
          </div>
          
          ${noShows.noShows.length > 0 ? `
            <div style="background: #fef2f2; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin: 0; color: #ef4444;">⚠️ ${noShows.noShows.length} No-Shows heute</h3>
            </div>
          ` : ''}
          
          <h2 style="margin-top: 30px;">✅ Aktive Team-Mitglieder</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background: #22c55e; color: white;">
                <th style="padding: 10px; text-align: left;">Name</th>
                <th style="padding: 10px; text-align: left;">E-Mail</th>
                <th style="padding: 10px; text-align: center;">Status</th>
              </tr>
            </thead>
            <tbody>${activeHtml || '<tr><td colspan="3" style="padding: 20px; text-align: center;">Keine aktiven User</td></tr>'}</tbody>
          </table>
          
          <h2 style="margin-top: 30px;">❌ Inaktive Team-Mitglieder</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background: #ef4444; color: white;">
                <th style="padding: 10px; text-align: left;">Name</th>
                <th style="padding: 10px; text-align: left;">E-Mail</th>
                <th style="padding: 10px; text-align: center;">Status</th>
              </tr>
            </thead>
            <tbody>${inactiveHtml || '<tr><td colspan="3" style="padding: 20px; text-align: center;">Alle User sind aktiv! 🎉</td></tr>'}</tbody>
          </table>
          
          <p style="color: #999; margin-top: 30px; font-size: 12px;">
            Automatisch generiert • Zoom Control Center
          </p>
        </div>
      `;

      await emailService.sendEmail({
        to: ADMIN_EMAIL,
        subject: `📊 Produktivität: ${activity.summary.activityRate}% aktiv (${activity.summary.active}/${activity.summary.total})`,
        html
      });

      logger.info('Produktivitäts-Report gesendet', { 
        active: activity.summary.active, 
        inactive: activity.summary.inactive 
      });

      return { success: true, activity, noShows };
    } catch (error) {
      logger.error('Produktivitäts-Report Fehler', { error: error.message });
      throw error;
    }
  }

  /**
   * Hilfsfunktion: Datum-String
   */
  getDateString(daysOffset) {
    const date = new Date();
    date.setDate(date.getDate() + daysOffset);
    return date.toISOString().split('T')[0];
  }
}

export const meetingQualityService = new MeetingQualityService();
