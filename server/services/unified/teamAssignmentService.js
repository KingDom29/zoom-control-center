/**
 * Team Assignment Service
 * Verteilt Kontakte an Teammitglieder und sendet Anruf-Empfehlungen
 * 
 * "Du solltest jetzt anrufen bei X weil Y"
 */

import { zoomApi } from '../zoomAuth.js';
import { emailService } from '../emailService.js';
import { zendeskService } from '../zendeskService.js';
import { unifiedContactService } from './unifiedContactService.js';
import { callManagerService, PRIORITY, CALL_REASONS } from './callManagerService.js';
import { brandingService } from './brandingService.js';
import logger from '../../utils/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ASSIGNMENTS_PATH = path.join(__dirname, '../../data/team-assignments.json');

// Team-Rollen
export const ROLES = {
  SALES: 'sales',
  SUPPORT: 'support',
  ACCOUNT_MANAGER: 'account_manager',
  ADMIN: 'admin'
};

class TeamAssignmentService {

  constructor() {
    this.assignments = this.loadAssignments();
    this.teamCache = null;
    this.teamCacheTime = null;
  }

  loadAssignments() {
    try {
      if (fs.existsSync(ASSIGNMENTS_PATH)) {
        return JSON.parse(fs.readFileSync(ASSIGNMENTS_PATH, 'utf8'));
      }
    } catch (error) {
      logger.error('Assignments laden Fehler', { error: error.message });
    }
    return {
      members: {},
      contactAssignments: {},
      rules: []
    };
  }

  saveAssignments() {
    fs.writeFileSync(ASSIGNMENTS_PATH, JSON.stringify(this.assignments, null, 2));
  }

  // ============================================
  // TEAM MEMBERS (von Zoom)
  // ============================================

  /**
   * Holt alle Team-Mitglieder von Zoom
   */
  async getTeamMembers(forceRefresh = false) {
    // Cache für 10 Minuten
    if (!forceRefresh && this.teamCache && this.teamCacheTime && (Date.now() - this.teamCacheTime < 600000)) {
      return this.teamCache;
    }

    try {
      const response = await zoomApi('GET', '/users?status=active&page_size=100');
      const zoomUsers = response.users || [];

      // Mit lokalen Einstellungen mergen
      const members = zoomUsers.map(user => {
        const localData = this.assignments.members[user.id] || {};
        return {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          displayName: `${user.first_name} ${user.last_name}`,
          department: user.dept || localData.department || '',
          role: localData.role || ROLES.SALES,
          canReceiveCalls: localData.canReceiveCalls !== false,
          maxCallsPerDay: localData.maxCallsPerDay || 10,
          brands: localData.brands || ['maklerplan', 'leadquelle'],
          notifyVia: localData.notifyVia || ['email', 'zendesk'],
          isActive: true
        };
      });

      this.teamCache = members;
      this.teamCacheTime = Date.now();

      return members;
    } catch (error) {
      logger.error('Team Members laden Fehler', { error: error.message });
      return [];
    }
  }

  /**
   * Team-Member Einstellungen aktualisieren
   */
  updateMemberSettings(memberId, settings) {
    this.assignments.members[memberId] = {
      ...this.assignments.members[memberId],
      ...settings
    };
    this.saveAssignments();
    this.teamCache = null; // Cache invalidieren
  }

  // ============================================
  // CONTACT ASSIGNMENT
  // ============================================

  /**
   * Kontakt einem Team-Mitglied zuweisen
   */
  async assignContact(contactId, memberId, reason = null) {
    const contact = unifiedContactService.getContact(contactId);
    if (!contact) throw new Error('Contact not found');

    // Im Contact speichern
    contact.assignedTo = memberId;
    unifiedContactService.saveContacts();

    // In Assignments speichern
    this.assignments.contactAssignments[contactId] = {
      memberId,
      assignedAt: new Date().toISOString(),
      reason
    };
    this.saveAssignments();

    logger.info('Contact assigned', { contactId, memberId });
    return { success: true, contactId, memberId };
  }

  /**
   * Automatische Zuweisung basierend auf Regeln
   */
  async autoAssignContact(contactId) {
    const contact = unifiedContactService.getContact(contactId);
    if (!contact) return null;

    const members = await this.getTeamMembers();
    const eligibleMembers = members.filter(m => 
      m.canReceiveCalls && 
      m.brands.includes(contact.activeBrand)
    );

    if (eligibleMembers.length === 0) return null;

    // Round-Robin oder Last-Used Zuweisung
    // Für jetzt: Random
    const member = eligibleMembers[Math.floor(Math.random() * eligibleMembers.length)];
    
    await this.assignContact(contactId, member.id, 'auto_assigned');
    return member;
  }

  // ============================================
  // CALL RECOMMENDATIONS (Das Herzstück!)
  // ============================================

  /**
   * Generiert persönliche Anruf-Empfehlungen für jedes Team-Mitglied
   */
  async generateTeamRecommendations() {
    const members = await this.getTeamMembers();
    const recommendations = [];

    for (const member of members) {
      if (!member.canReceiveCalls) continue;

      // Kontakte die diesem Mitglied zugewiesen sind ODER unzugewiesen
      const memberContacts = unifiedContactService.findContacts({
        hasPhone: true,
        optedOut: false
      }).contacts.filter(c => 
        c.assignedTo === member.id || 
        (!c.assignedTo && member.brands.includes(c.activeBrand))
      );

      const memberCalls = [];

      for (const contact of memberContacts.slice(0, 50)) { // Max 50 analysieren
        try {
          const analysis = await callManagerService.analyzeContact(contact.id);
          if (analysis && analysis.callPriority !== PRIORITY.NONE) {
            memberCalls.push(analysis);
          }
        } catch (error) {
          // Skip
        }
      }

      // Nach Priorität sortieren
      memberCalls.sort((a, b) => b.score - a.score);

      recommendations.push({
        member,
        calls: memberCalls.slice(0, member.maxCallsPerDay),
        totalPending: memberCalls.length
      });
    }

    return recommendations;
  }

  /**
   * Sendet Anruf-Empfehlungen an alle Team-Mitglieder
   */
  async sendDailyRecommendations() {
    logger.info('📧 Starte Team-Empfehlungen...');
    
    const recommendations = await this.generateTeamRecommendations();
    let emailsSent = 0;
    let ticketsCreated = 0;

    for (const rec of recommendations) {
      if (rec.calls.length === 0) continue;

      const { member, calls } = rec;

      // E-Mail senden
      if (member.notifyVia.includes('email')) {
        await this.sendRecommendationEmail(member, calls);
        emailsSent++;
      }

      // Zendesk Ticket für jeden dringenden Anruf
      if (member.notifyVia.includes('zendesk')) {
        for (const call of calls.filter(c => c.callPriority === PRIORITY.URGENT || c.callPriority === PRIORITY.HIGH)) {
          await this.createCallTicket(member, call);
          ticketsCreated++;
        }
      }
    }

    logger.info('✅ Team-Empfehlungen gesendet', { emailsSent, ticketsCreated });
    return { emailsSent, ticketsCreated, recommendations };
  }

  /**
   * Sendet personalisierte E-Mail mit Anruf-Empfehlungen
   */
  async sendRecommendationEmail(member, calls) {
    const urgentCalls = calls.filter(c => c.callPriority === PRIORITY.URGENT);
    const highCalls = calls.filter(c => c.callPriority === PRIORITY.HIGH);
    const otherCalls = calls.filter(c => c.callPriority !== PRIORITY.URGENT && c.callPriority !== PRIORITY.HIGH);

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto;">
        <h1 style="color: #1a73e8;">📞 Guten Morgen, ${member.firstName}!</h1>
        
        <p>Hier sind deine Anruf-Empfehlungen für heute:</p>
        
        ${urgentCalls.length > 0 ? `
          <div style="background: #fef2f2; border: 2px solid #dc2626; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <h2 style="color: #dc2626; margin-top: 0;">🔥 SOFORT ANRUFEN (${urgentCalls.length})</h2>
            ${urgentCalls.map(call => this.formatCallHtml(call, true)).join('')}
          </div>
        ` : ''}
        
        ${highCalls.length > 0 ? `
          <div style="background: #fef3c7; border: 2px solid #f59e0b; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <h2 style="color: #f59e0b; margin-top: 0;">📞 Heute anrufen (${highCalls.length})</h2>
            ${highCalls.map(call => this.formatCallHtml(call, false)).join('')}
          </div>
        ` : ''}
        
        ${otherCalls.length > 0 ? `
          <div style="background: #f0f9ff; border: 1px solid #1a73e8; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <h2 style="color: #1a73e8; margin-top: 0;">📅 Diese Woche (${otherCalls.length})</h2>
            ${otherCalls.slice(0, 5).map(call => this.formatCallHtml(call, false)).join('')}
            ${otherCalls.length > 5 ? `<p style="color: #666;">+ ${otherCalls.length - 5} weitere...</p>` : ''}
          </div>
        ` : ''}
        
        <p style="color: #666; font-size: 12px; margin-top: 30px;">
          Automatisch generiert vom Maklerplan CRM • ${new Date().toLocaleDateString('de-DE')}
        </p>
      </div>
    `;

    await emailService.sendEmail({
      to: member.email,
      subject: `📞 ${urgentCalls.length > 0 ? '🔥 URGENT: ' : ''}${calls.length} Anruf-Empfehlungen für heute`,
      html
    });
  }

  formatCallHtml(call, isUrgent) {
    const contact = call.contact;
    const phone = call.phone;
    const reasons = call.reasons.map(r => callManagerService.getReasonText ? 
      this.getReasonText(r) : r.reason).join(', ');

    return `
      <div style="background: white; padding: 15px; border-radius: 8px; margin: 10px 0; border-left: 4px solid ${isUrgent ? '#dc2626' : '#f59e0b'};">
        <div style="display: flex; justify-content: space-between; align-items: start;">
          <div>
            <h3 style="margin: 0 0 5px;">${contact.company || `${contact.firstName} ${contact.lastName}`}</h3>
            <p style="margin: 0; color: #666;">${contact.firstName} ${contact.lastName}</p>
            <p style="margin: 5px 0;">
              <a href="tel:${phone}" style="color: #1a73e8; font-weight: bold; font-size: 18px;">📞 ${phone}</a>
            </p>
          </div>
          <div style="text-align: right;">
            <span style="background: ${isUrgent ? '#dc2626' : '#f59e0b'}; color: white; padding: 3px 8px; border-radius: 4px; font-size: 12px;">
              Score: ${call.score}
            </span>
          </div>
        </div>
        <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #eee;">
          <p style="margin: 0; font-size: 14px;"><strong>Warum anrufen:</strong> ${reasons}</p>
          <p style="margin: 5px 0 0; font-size: 12px; color: #666;">
            Stage: ${contact.stage} • Brand: ${call.brand?.name || contact.activeBrand} • 
            Beste Zeit: ${call.bestTimeToCall}
          </p>
        </div>
      </div>
    `;
  }

  getReasonText(reason) {
    const texts = {
      'hot_lead': '🔥 Hot Lead - Hat auf Link geklickt',
      'ticket_urgent': '🚨 Dringendes Ticket offen',
      'ticket_waiting': '⏳ Ticket wartet auf Antwort',
      'no_show': '❌ Meeting verpasst',
      'meeting_followup': '📞 Follow-Up nach Meeting',
      'proposal_sent': '📄 Angebot gesendet - Nachfassen',
      'inactive_customer': '😴 Kunde lange inaktiv',
      'reactivation': '🔄 Win-Back Kandidat',
      'email_replied': '📧 Hat auf E-Mail geantwortet'
    };
    return texts[reason.reason] || reason.reason;
  }

  /**
   * Erstellt Zendesk Ticket für einen Anruf
   */
  async createCallTicket(member, call) {
    const contact = call.contact;
    const reasons = call.reasons.map(r => this.getReasonText(r)).join('<br>');

    await zendeskService.createTicket({
      subject: `📞 ${call.callPriority === PRIORITY.URGENT ? '🔥 URGENT: ' : ''}Anruf: ${contact.company || contact.firstName}`,
      description: `
        <h2>Anruf-Empfehlung für ${member.displayName}</h2>
        
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Kontakt:</strong></td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${contact.firstName} ${contact.lastName}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Firma:</strong></td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${contact.company || '-'}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Telefon:</strong></td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;"><a href="tel:${call.phone}">${call.phone}</a></td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>E-Mail:</strong></td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${contact.email}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Priorität:</strong></td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${call.callPriority} (Score: ${call.score})</td>
          </tr>
        </table>
        
        <h3>Warum anrufen:</h3>
        <p>${reasons}</p>
        
        <p><strong>Beste Zeit:</strong> ${call.bestTimeToCall}</p>
      `,
      priority: call.callPriority === PRIORITY.URGENT ? 'urgent' : 'high',
      type: 'task',
      tags: ['call-recommendation', call.callPriority, member.id],
      requesterEmail: contact.email,
      requesterName: `${contact.firstName} ${contact.lastName}`
    });
  }

  // ============================================
  // STATISTICS
  // ============================================

  async getTeamStats() {
    const members = await this.getTeamMembers();
    const stats = [];

    for (const member of members) {
      const assignedContacts = unifiedContactService.findContacts({ assignedTo: member.id }).contacts;
      
      stats.push({
        member: {
          id: member.id,
          name: member.displayName,
          email: member.email
        },
        assignedContacts: assignedContacts.length,
        byStage: assignedContacts.reduce((acc, c) => {
          acc[c.stage] = (acc[c.stage] || 0) + 1;
          return acc;
        }, {})
      });
    }

    return stats;
  }
}

export const teamAssignmentService = new TeamAssignmentService();
