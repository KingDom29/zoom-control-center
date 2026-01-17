/**
 * Team Activity Service
 * Verwaltet Team-Aktivitäten, Reports und Benachrichtigungen
 */

import { zoomApi } from './zoomAuth.js';
import { emailService } from './emailService.js';
import logger from '../utils/logger.js';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'de@maklerplan.com';

class TeamActivityService {
  
  /**
   * Alle Team-Mitglieder mit Details abrufen
   */
  async getTeamOverview() {
    try {
      const usersResponse = await zoomApi('GET', '/users?status=active&page_size=300');
      const users = usersResponse.users || [];
      
      const teamMembers = await Promise.all(users.map(async (user) => {
        try {
          const [settings, meetings] = await Promise.all([
            zoomApi('GET', `/users/${user.id}/settings`).catch(() => null),
            zoomApi('GET', `/users/${user.id}/meetings?type=scheduled`).catch(() => ({ meetings: [] }))
          ]);
          
          return {
            id: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            displayName: `${user.first_name} ${user.last_name}`,
            type: this.getUserType(user.type),
            status: user.status,
            lastLogin: user.last_login_time,
            created: user.created_at,
            pmi: user.pmi,
            timezone: user.timezone,
            department: user.dept || 'Nicht zugewiesen',
            jobTitle: user.job_title || '',
            scheduledMeetings: meetings.meetings?.length || 0,
            phoneEnabled: settings?.feature?.zoom_phone || false,
            roomsEnabled: settings?.feature?.zoom_rooms || false
          };
        } catch (error) {
          return {
            id: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            displayName: `${user.first_name} ${user.last_name}`,
            type: this.getUserType(user.type),
            status: user.status,
            error: error.message
          };
        }
      }));
      
      return {
        total: teamMembers.length,
        members: teamMembers,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Team Overview Fehler', { error: error.message });
      throw error;
    }
  }

  /**
   * User-Typ in lesbaren String umwandeln
   */
  getUserType(type) {
    const types = {
      1: 'Basic',
      2: 'Licensed',
      3: 'On-Prem',
      99: 'None'
    };
    return types[type] || 'Unknown';
  }

  /**
   * Aktivitäten eines Users für einen Zeitraum abrufen
   */
  async getUserActivity(userId, fromDate, toDate) {
    try {
      const from = fromDate || this.getDateString(-30);
      const to = toDate || this.getDateString(0);
      
      const [meetings, recordings] = await Promise.all([
        zoomApi('GET', `/report/users/${userId}/meetings?from=${from}&to=${to}`).catch(() => ({ meetings: [] })),
        zoomApi('GET', `/users/${userId}/recordings?from=${from}&to=${to}`).catch(() => ({ meetings: [] }))
      ]);
      
      const meetingList = meetings.meetings || [];
      const recordingList = recordings.meetings || [];
      
      return {
        userId,
        period: { from, to },
        meetings: {
          total: meetingList.length,
          totalMinutes: meetingList.reduce((sum, m) => sum + (m.duration || 0), 0),
          totalParticipants: meetingList.reduce((sum, m) => sum + (m.participants_count || 0), 0),
          list: meetingList.map(m => ({
            id: m.id,
            uuid: m.uuid,
            topic: m.topic,
            startTime: m.start_time,
            endTime: m.end_time,
            duration: m.duration,
            participants: m.participants_count,
            type: m.type
          }))
        },
        recordings: {
          total: recordingList.length,
          list: recordingList.map(r => ({
            id: r.id,
            topic: r.topic,
            startTime: r.start_time,
            duration: r.duration,
            fileCount: r.recording_files?.length || 0,
            totalSize: r.total_size
          }))
        }
      };
    } catch (error) {
      logger.error('User Activity Fehler', { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Team-Aktivitäts-Report generieren
   */
  async generateTeamReport(period = 'week') {
    try {
      const days = period === 'week' ? -7 : period === 'month' ? -30 : -1;
      const from = this.getDateString(days);
      const to = this.getDateString(0);
      
      const team = await this.getTeamOverview();
      const activities = await Promise.all(
        team.members.map(async (member) => {
          const activity = await this.getUserActivity(member.id, from, to);
          return {
            ...member,
            activity
          };
        })
      );
      
      const report = {
        period: { from, to, type: period },
        generatedAt: new Date().toISOString(),
        summary: {
          totalMembers: activities.length,
          totalMeetings: activities.reduce((sum, a) => sum + a.activity.meetings.total, 0),
          totalMinutes: activities.reduce((sum, a) => sum + a.activity.meetings.totalMinutes, 0),
          totalParticipants: activities.reduce((sum, a) => sum + a.activity.meetings.totalParticipants, 0),
          totalRecordings: activities.reduce((sum, a) => sum + a.activity.recordings.total, 0)
        },
        members: activities.sort((a, b) => b.activity.meetings.total - a.activity.meetings.total)
      };
      
      return report;
    } catch (error) {
      logger.error('Team Report Fehler', { error: error.message });
      throw error;
    }
  }

  /**
   * Team-Report per E-Mail senden
   */
  async sendTeamReportEmail(period = 'week') {
    try {
      const report = await this.generateTeamReport(period);
      
      const periodText = period === 'week' ? 'Wöchentlicher' : period === 'month' ? 'Monatlicher' : 'Täglicher';
      
      const membersHtml = report.members.map(m => `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #eee;">${m.displayName}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee;">${m.email}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${m.activity.meetings.total}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${m.activity.meetings.totalMinutes} Min</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${m.activity.recordings.total}</td>
        </tr>
      `).join('');
      
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
          <h1 style="color: #1a73e8;">📊 ${periodText} Team-Report</h1>
          <p style="color: #666;">Zeitraum: ${report.period.from} bis ${report.period.to}</p>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2 style="margin-top: 0;">📈 Zusammenfassung</h2>
            <table style="width: 100%;">
              <tr>
                <td><strong>Team-Mitglieder:</strong></td>
                <td>${report.summary.totalMembers}</td>
              </tr>
              <tr>
                <td><strong>Meetings gesamt:</strong></td>
                <td>${report.summary.totalMeetings}</td>
              </tr>
              <tr>
                <td><strong>Meeting-Minuten:</strong></td>
                <td>${report.summary.totalMinutes} Min (${Math.round(report.summary.totalMinutes / 60)} Std)</td>
              </tr>
              <tr>
                <td><strong>Teilnehmer gesamt:</strong></td>
                <td>${report.summary.totalParticipants}</td>
              </tr>
              <tr>
                <td><strong>Recordings:</strong></td>
                <td>${report.summary.totalRecordings}</td>
              </tr>
            </table>
          </div>
          
          <h2>👥 Team-Aktivitäten</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background: #1a73e8; color: white;">
                <th style="padding: 12px; text-align: left;">Name</th>
                <th style="padding: 12px; text-align: left;">E-Mail</th>
                <th style="padding: 12px; text-align: center;">Meetings</th>
                <th style="padding: 12px; text-align: center;">Dauer</th>
                <th style="padding: 12px; text-align: center;">Recordings</th>
              </tr>
            </thead>
            <tbody>
              ${membersHtml}
            </tbody>
          </table>
          
          <p style="color: #999; margin-top: 30px; font-size: 12px;">
            Automatisch generiert am ${new Date().toLocaleString('de-DE')}<br>
            Zoom Control Center
          </p>
        </div>
      `;
      
      await emailService.sendEmail({
        to: ADMIN_EMAIL,
        subject: `📊 ${periodText} Zoom Team-Report (${report.summary.totalMeetings} Meetings)`,
        html
      });
      
      logger.info('Team Report E-Mail gesendet', { 
        to: ADMIN_EMAIL, 
        period, 
        meetings: report.summary.totalMeetings 
      });
      
      return { success: true, report, emailSentTo: ADMIN_EMAIL };
    } catch (error) {
      logger.error('Team Report E-Mail Fehler', { error: error.message });
      throw error;
    }
  }

  /**
   * Zoom Rooms abrufen
   */
  async getRooms() {
    try {
      const rooms = await zoomApi('GET', '/rooms');
      return rooms;
    } catch (error) {
      logger.error('Rooms Fehler', { error: error.message });
      return { rooms: [] };
    }
  }

  /**
   * Zoom Phone Users abrufen
   */
  async getPhoneUsers() {
    try {
      const phoneUsers = await zoomApi('GET', '/phone/users');
      return phoneUsers;
    } catch (error) {
      logger.error('Phone Users Fehler', { error: error.message });
      return { users: [] };
    }
  }

  /**
   * User zu Zoom Phone hinzufügen
   */
  async assignPhoneToUser(userId, phoneNumber) {
    try {
      const result = await zoomApi('POST', `/phone/users/${userId}/phone_numbers`, {
        phone_numbers: [{ number: phoneNumber }]
      });
      logger.info('Phone zugewiesen', { userId, phoneNumber });
      return result;
    } catch (error) {
      logger.error('Phone Zuweisung Fehler', { userId, error: error.message });
      throw error;
    }
  }

  /**
   * User zu Zoom Room hinzufügen
   */
  async assignRoomToUser(userId, roomId) {
    try {
      const result = await zoomApi('PATCH', `/rooms/${roomId}/members`, {
        method: 'add',
        members: [{ id: userId }]
      });
      logger.info('Room zugewiesen', { userId, roomId });
      return result;
    } catch (error) {
      logger.error('Room Zuweisung Fehler', { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Hilfsfunktion: Datum-String generieren
   */
  getDateString(daysOffset) {
    const date = new Date();
    date.setDate(date.getDate() + daysOffset);
    return date.toISOString().split('T')[0];
  }
}

export const teamActivityService = new TeamActivityService();
