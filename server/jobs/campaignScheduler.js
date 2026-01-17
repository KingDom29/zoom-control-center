import cron from 'node-cron';
import { campaignService } from '../services/campaignService.js';
import { sequenceEngine } from '../services/sequenceEngine.js';
import { teamActivityService } from '../services/teamActivityService.js';
import { meetingQualityService } from '../services/meetingQualityService.js';
import { salesAutomationService } from '../services/salesAutomationService.js';
import { pipelineService } from '../services/unified/pipelineService.js';
import { callManagerService } from '../services/unified/callManagerService.js';
import logger from '../utils/logger.js';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Kampagnen-Fortsetzung Funktion
async function runCampaignBatch() {
  logger.info('⏰ Starte geplante Kampagnen-Fortsetzung...');
  
  try {
    // 1. Meetings erstellen (in Batches bis Rate Limit)
    let created = 0;
    let totalCreated = 0;
    let rateLimitHit = false;
    
    do {
      const res = await fetch('http://localhost:3001/api/campaign/meetings/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 100 })
      });
      const result = await res.json();
      created = result.created || 0;
      totalCreated += created;
      
      logger.info(`✅ Meetings erstellt: ${created} (Total heute: ${totalCreated})`);
      
      // Bei Rate Limit oder Fehlern abbrechen
      if (result.failed > 0 && result.errors) {
        const hasRateLimit = Object.values(result.errors).some(e => 
          e.error?.includes('429') || e.error?.includes('rate')
        );
        if (hasRateLimit) {
          logger.warn('⚠️ Rate Limit erreicht - Stoppe Meeting-Erstellung für heute');
          rateLimitHit = true;
          break;
        }
      }
      
      // Pause zwischen Batches (Rate Limit vermeiden)
      if (created > 0) await sleep(5000);
      
    } while (created > 0 && !rateLimitHit);

    // 2. Einladungen senden für alle erstellten Meetings
    let sent = 0;
    let totalSent = 0;
    
    do {
      const res = await fetch('http://localhost:3001/api/campaign/emails/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 100 })
      });
      const result = await res.json();
      sent = result.sent || 0;
      totalSent += sent;
      
      logger.info(`📧 Einladungen gesendet: ${sent} (Total heute: ${totalSent})`);
      
      // Pause zwischen Batches
      if (sent > 0) await sleep(5000);
      
    } while (sent > 0);

    logger.info('═══════════════════════════════════════════');
    logger.info('✅ TAGES-KAMPAGNE ABGESCHLOSSEN');
    logger.info(`   Meetings erstellt: ${totalCreated}`);
    logger.info(`   Einladungen gesendet: ${totalSent}`);
    logger.info('═══════════════════════════════════════════');
    
    return { totalCreated, totalSent, rateLimitHit };
    
  } catch (error) {
    logger.error('❌ Kampagnen-Fehler', { error: error.message });
    return { error: error.message };
  }
}

// Cron Job: Jeden Tag um 08:00 Uhr (Europe/Berlin)
const campaignJob = cron.schedule('0 8 * * *', async () => {
  await runCampaignBatch();
}, {
  timezone: 'Europe/Berlin',
  scheduled: true
});

logger.info('📅 Kampagnen-Scheduler aktiv: Täglich um 08:00 Uhr (Europe/Berlin)');

async function runSequenceProcessor() {
  try {
    const result = await sequenceEngine.processDueSteps({ limit: 250 });
    const didWork =
      result.processed > 0 ||
      result.emailsSent > 0 ||
      result.emailsDryRun > 0 ||
      result.tasksCreated > 0 ||
      result.completed > 0 ||
      (result.errors && result.errors.length > 0);

    if (didWork) {
      logger.info(
        `✉️ Sequences verarbeitet: processed=${result.processed}, sent=${result.emailsSent}, dryRun=${result.emailsDryRun}, tasks=${result.tasksCreated}, completed=${result.completed}`
      );
    }

    return result;
  } catch (error) {
    logger.error('❌ Sequence Processor Fehler', { error: error.message });
    return { error: error.message };
  }
}

const sequenceJob = cron.schedule('*/10 * * * *', async () => {
  if (process.env.SEQUENCE_PROCESSOR_ENABLED !== 'true') return;
  await runSequenceProcessor();
}, {
  timezone: 'Europe/Berlin',
  scheduled: true
});

logger.info('✉️ Sequence Processor geplant: Alle 10 Minuten (SEQUENCE_PROCESSOR_ENABLED=true zum Aktivieren)');

// No-Show Email Processor: Alle 15 Minuten prüfen
const noShowEmailJob = cron.schedule('*/15 * * * *', async () => {
  try {
    const result = await campaignService.processPendingNoShowEmails();
    if (result.sent > 0) {
      logger.info(`📧 No-Show E-Mails gesendet: ${result.sent}`);
    }
  } catch (error) {
    logger.error('❌ No-Show Email Job Fehler', { error: error.message });
  }
}, {
  timezone: 'Europe/Berlin',
  scheduled: true
});

logger.info('📧 No-Show Email Processor aktiv: Alle 15 Minuten');

// Re-Engagement Processor: Alle 10 Minuten, 110 Emails pro Batch
async function runReengagementProcessor() {
  try {
    const res = await fetch('http://localhost:3001/api/campaign/send-reengagement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 110, dryRun: false })
    });
    const result = await res.json();
    
    if (result.sent > 0) {
      logger.info(`🔄 Re-Engagement E-Mails gesendet: ${result.sent}, verbleibend: ${result.remaining}`);
    }
    
    return result;
  } catch (error) {
    logger.error('❌ Re-Engagement Processor Fehler', { error: error.message });
    return { error: error.message };
  }
}

const reengagementJob = cron.schedule('*/10 * * * *', async () => {
  if (process.env.REENGAGEMENT_ENABLED !== 'true') return;
  await runReengagementProcessor();
}, {
  timezone: 'Europe/Berlin',
  scheduled: true
});

logger.info('🔄 Re-Engagement Processor geplant: Alle 10 Minuten (REENGAGEMENT_ENABLED=true zum Aktivieren)');

// Reply Sync: Alle 30 Minuten neue Replies synchronisieren
async function runReplySync() {
  try {
    const res = await fetch('http://localhost:3001/api/campaign/sync-replies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const result = await res.json();
    
    if (result.updated > 0) {
      logger.info(`📨 Replies synchronisiert: ${result.updated} neue`);
    }
    
    return result;
  } catch (error) {
    logger.error('❌ Reply Sync Fehler', { error: error.message });
    return { error: error.message };
  }
}

const replySyncJob = cron.schedule('*/30 * * * *', async () => {
  await runReplySync();
}, {
  timezone: 'Europe/Berlin',
  scheduled: true
});

logger.info('📨 Reply Sync aktiv: Alle 30 Minuten');

// Daily Report Job - täglich um 18:00 Uhr
const dailyReportJob = cron.schedule('0 18 * * *', async () => {
  logger.info('📊 Sende Tages-Report...');
  try {
    const fetch = (await import('node-fetch')).default;
    await fetch('http://localhost:3001/api/campaign/send-daily-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipients: ['support@maklerplan.com'] })
    });
    logger.info('📊 Tages-Report gesendet');
  } catch (error) {
    logger.error('Daily report error', { error: error.message });
  }
}, {
  timezone: 'Europe/Berlin',
  scheduled: true
});

logger.info('📊 Daily Report geplant: Täglich um 18:00 Uhr');

// =============================================
// DAILY HEALTH CHECK - Täglich um 09:00 Uhr
// =============================================

async function runHealthCheck() {
  logger.info('🏥 Health-Check gestartet...');
  
  const issues = [];
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'support@maklerplan.com';
  
  try {
    // 1. Server-Status prüfen
    const healthRes = await fetch('http://localhost:3001/api/health');
    const health = await healthRes.json();
    
    if (health.status !== 'healthy') {
      issues.push(`⚠️ Server-Status: ${health.status}`);
    }
    
    // 2. Campaign-Daten prüfen
    const { campaignService } = await import('../services/campaignService.js');
    const stats = campaignService.getStats();
    
    if (!stats || stats.totalContacts === 0) {
      issues.push('❌ Keine Kampagnen-Daten geladen');
    }
    
    // 3. Zoom API prüfen (nur Token-Abruf, nicht API-Call - Scopes sind begrenzt)
    try {
      const { getAccessToken } = await import('../services/zoomAuth.js');
      const token = await getAccessToken();
      if (!token || token.length < 100) {
        issues.push('❌ Zoom Token ungültig');
      }
    } catch (zoomError) {
      issues.push(`❌ Zoom Auth Fehler: ${zoomError.message}`);
    }
    
    // 4. E-Mail Service prüfen
    try {
      const { emailService } = await import('../services/emailService.js');
      if (!emailService.isInitialized) {
        await emailService.initialize();
      }
    } catch (emailError) {
      issues.push(`❌ E-Mail Service Fehler: ${emailError.message}`);
    }
    
    // 5. Speicherplatz prüfen
    const memUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    if (heapUsedMB > 500) {
      issues.push(`⚠️ Hoher Speicherverbrauch: ${heapUsedMB} MB`);
    }
    
    // 6. Pending Jobs prüfen
    const pendingNoShows = campaignService.campaign?.pendingNoShowEmails?.filter(p => !p.sent) || [];
    if (pendingNoShows.length > 10) {
      issues.push(`⚠️ ${pendingNoShows.length} ausstehende No-Show E-Mails`);
    }
    
    // Bei Problemen E-Mail senden
    if (issues.length > 0) {
      logger.warn('🏥 Health-Check: Probleme gefunden', { issues });
      
      const { emailService } = await import('../services/emailService.js');
      await emailService.sendEmail({
        to: ADMIN_EMAIL,
        subject: `🚨 Zoom Control Center - Health-Check Alert`,
        body: `
<div style="font-family: Arial, sans-serif; max-width: 600px;">
  <h2 style="color: #dc2626;">🏥 Health-Check Alert</h2>
  <p>Der tägliche Health-Check hat folgende Probleme gefunden:</p>
  
  <div style="background: #fef2f2; padding: 15px; border-radius: 8px; margin: 20px 0;">
    ${issues.map(i => `<p style="margin: 5px 0;">• ${i}</p>`).join('')}
  </div>
  
  <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Server:</strong></td>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">${process.env.PUBLIC_URL || 'localhost:3001'}</td>
    </tr>
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Uptime:</strong></td>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m</td>
    </tr>
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Memory:</strong></td>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">${heapUsedMB} MB</td>
    </tr>
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Zeitpunkt:</strong></td>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">${new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}</td>
    </tr>
  </table>
  
  <p style="color: #666; font-size: 12px;">
    Diese E-Mail wurde automatisch vom Zoom Control Center Health-Check gesendet.
  </p>
</div>
        `.trim()
      });
      
      logger.info(`📧 Health-Check Alert gesendet an ${ADMIN_EMAIL}`);
    } else {
      logger.info('✅ Health-Check: Alles OK');
    }
    
    return { ok: issues.length === 0, issues };
    
  } catch (error) {
    logger.error('❌ Health-Check Fehler', { error: error.message });
    
    // Bei kritischem Fehler trotzdem versuchen E-Mail zu senden
    try {
      const { emailService } = await import('../services/emailService.js');
      await emailService.sendEmail({
        to: ADMIN_EMAIL,
        subject: `🚨 KRITISCH: Zoom Control Center Health-Check fehlgeschlagen`,
        body: `<p>Der Health-Check konnte nicht durchgeführt werden:</p><p><strong>${error.message}</strong></p>`
      });
    } catch (e) {
      logger.error('Konnte Alert-E-Mail nicht senden', { error: e.message });
    }
    
    return { ok: false, error: error.message };
  }
}

const healthCheckJob = cron.schedule('0 9 * * *', async () => {
  await runHealthCheck();
}, {
  timezone: 'Europe/Berlin',
  scheduled: true
});

logger.info('🏥 Health-Check geplant: Täglich um 09:00 Uhr');

// =============================================
// LEAD OUTREACH - Jede Stunde (5 E-Mails/Stunde)
// =============================================

async function runLeadOutreach() {
  if (process.env.LEAD_OUTREACH_ENABLED !== 'true') return;
  
  try {
    const { leadOutreachService } = await import('../services/leadOutreachService.js');
    
    // 1. Follow-up E-Mails für bestehende Sequenzen
    const processed = await leadOutreachService.processSequences();
    if (processed > 0) {
      logger.info(`📬 Lead-Outreach: ${processed} Follow-up E-Mails gesendet`);
    }
    
    // 2. Neue Leads aus Queue anschreiben (max 5/Stunde)
    const result = await leadOutreachService.runLeadGeneration();
    if (result.sent > 0) {
      logger.info(`📬 Lead-Outreach: ${result.sent} neue E-Mails, Queue: ${result.remaining}`);
    }
    
  } catch (error) {
    logger.error('Lead-Outreach Fehler', { error: error.message });
  }
}

// Stündlich zur vollen Stunde (9-18 Uhr Werktags)
const leadOutreachJob = cron.schedule('0 9-18 * * 1-5', runLeadOutreach, {
  timezone: 'Europe/Berlin',
  scheduled: true
});

logger.info('📬 Lead-Outreach geplant: Stündlich 9-18 Uhr Mo-Fr (LEAD_OUTREACH_ENABLED=true)');

// =============================================
// HOT LEAD DETECTOR - Alle 15 Minuten Inbox scannen
// =============================================

async function runHotLeadScan() {
  try {
    const { hotLeadDetector } = await import('../services/hotLeadDetector.js');
    
    const result = await hotLeadDetector.scanAndNotify({
      minScore: 50,
      notifyEmail: 'de@maklerplan.com',
      createMeeting: true
    });
    
    if (result.notified.length > 0) {
      logger.info(`🔥 Hot Lead Detector: ${result.notified.length} Leads benachrichtigt`);
    } else if (result.scanned.hotLeads > 0) {
      logger.info(`🔥 Hot Lead Detector: ${result.scanned.hotLeads} Hot Leads gefunden (Score < 50)`);
    }
    
  } catch (error) {
    logger.error('Hot Lead Detector Fehler', { error: error.message });
  }
}

// Alle 15 Minuten (8-19 Uhr)
const hotLeadJob = cron.schedule('*/15 8-19 * * *', runHotLeadScan, {
  timezone: 'Europe/Berlin',
  scheduled: true
});

logger.info('🔥 Hot Lead Detector geplant: Alle 15 Min 8-19 Uhr');

// =============================================
// MULTI-LEAD SEQUENZEN (Leadquelle) - Täglich Follow-ups
// =============================================

async function runMultiLeadSequences() {
  try {
    const { multiLeadService } = await import('../services/multiLeadService.js');
    
    const result = await multiLeadService.processSequences();
    
    if (result.processed > 0) {
      logger.info(`📧 Leadquelle: ${result.processed} Follow-up E-Mails gesendet`);
    }
    
  } catch (error) {
    logger.error('Multi-Lead Sequenz Fehler', { error: error.message });
  }
}

// Täglich um 10:00 und 15:00 Uhr (Werktags) - Follow-ups
const multiLeadJob = cron.schedule('0 10,15 * * 1-5', runMultiLeadSequences, {
  timezone: 'Europe/Berlin',
  scheduled: true
});

logger.info('📧 Leadquelle Sequenzen geplant: 10:00 + 15:00 Uhr Mo-Fr');

// =============================================
// LEADQUELLE AUTO-GENERATION - Google Places Suche
// =============================================

async function runLeadquelleGeneration() {
  try {
    const { multiLeadService } = await import('../services/multiLeadService.js');
    
    // Automatisch 5 neue Leads suchen und anschreiben
    const result = await multiLeadService.runLeadGeneration({
      maxLeads: 5,
      sendEmail: true
    });
    
    if (result.imported > 0) {
      logger.info(`🔍 Leadquelle: ${result.branchName} in ${result.city} - ${result.imported} Leads, ${result.emailed} E-Mails`);
    }
    
  } catch (error) {
    logger.error('Leadquelle Generation Fehler', { error: error.message });
  }
}

// Alle 2 Stunden (9-17 Uhr Werktags) neue Leads suchen
const leadquelleGenerationJob = cron.schedule('0 9,11,13,15,17 * * 1-5', runLeadquelleGeneration, {
  timezone: 'Europe/Berlin',
  scheduled: true
});

logger.info('🔍 Leadquelle Auto-Generation geplant: 9/11/13/15/17 Uhr Mo-Fr (5 Leads/Durchlauf)');

// =============================================
// STARTUP CATCH-UP - Verpasste Tasks nachholen
// =============================================

async function runStartupCatchup() {
  logger.info('🚀 Startup Catch-up: Prüfe verpasste Tasks...');
  
  const now = new Date();
  const hour = now.getHours();
  const isWorkday = now.getDay() >= 1 && now.getDay() <= 5;
  
  try {
    // 1. Reply Sync sofort ausführen (immer wichtig)
    logger.info('📨 Catch-up: Synchronisiere Replies...');
    await runReplySync();
    
    // 2. Auto-Replies verarbeiten (falls welche offen sind)
    logger.info('📧 Catch-up: Verarbeite offene Auto-Replies...');
    try {
      const res = await fetch('http://localhost:3001/api/campaign/process-replies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: false })
      });
      const result = await res.json();
      if (result.processed > 0) {
        logger.info(`✅ Catch-up: ${result.processed} Auto-Replies gesendet`);
      }
    } catch (e) {
      logger.warn('Catch-up Auto-Replies übersprungen', { error: e.message });
    }
    
    // 3. Kampagnen-Batch (nur an Werktagen 8-17 Uhr)
    if (isWorkday && hour >= 8 && hour < 17) {
      logger.info('📅 Catch-up: Starte Kampagnen-Batch...');
      await runCampaignBatch();
    }
    
    // 4. Re-Engagement (falls aktiviert, nur Werktags 9-16 Uhr)
    if (process.env.REENGAGEMENT_ENABLED === 'true' && isWorkday && hour >= 9 && hour < 16) {
      logger.info('🔄 Catch-up: Starte Re-Engagement...');
      await runReengagementProcessor();
    }
    
    // 5. Daily Report nachholen (falls nach 18 Uhr und noch nicht gesendet heute)
    if (hour >= 18) {
      logger.info('📊 Catch-up: Prüfe Daily Report...');
      // Report wird nur gesendet wenn noch nicht heute gesendet
      // (Die Logik dafür könnte erweitert werden mit lastReportSentAt tracking)
    }
    
    logger.info('✅ Startup Catch-up abgeschlossen');
  } catch (error) {
    logger.error('Startup Catch-up Fehler', { error: error.message });
  }
}

// Catch-up nach 5 Sekunden (Server muss erst vollständig starten)
setTimeout(() => {
  runStartupCatchup().catch(e => logger.error('Catch-up failed', { error: e.message }));
}, 5000);

// ============================================
// TEAM ACTIVITY REPORTS
// ============================================

// Team-Report Funktion
async function runTeamReport(period = 'day') {
  logger.info(`📊 Starte Team-Report (${period})...`);
  try {
    const result = await teamActivityService.sendTeamReportEmail(period);
    logger.info(`✅ Team-Report gesendet`, { 
      period, 
      meetings: result.report.summary.totalMeetings,
      to: result.emailSentTo 
    });
    return result;
  } catch (error) {
    logger.error('Team-Report Fehler', { error: error.message });
    throw error;
  }
}

// Täglicher Team-Report - Jeden Tag um 18:00 Uhr
const dailyTeamReportJob = cron.schedule('0 18 * * *', async () => {
  await runTeamReport('day');
}, { timezone: 'Europe/Berlin' });
logger.info('📊 Daily Team Report Job: Täglich 18:00 Uhr');

// Wöchentlicher Team-Report - Jeden Freitag um 17:00 Uhr
const weeklyTeamReportJob = cron.schedule('0 17 * * 5', async () => {
  await runTeamReport('week');
}, { timezone: 'Europe/Berlin' });
logger.info('📊 Weekly Team Report Job: Freitags 17:00 Uhr');

// ============================================
// PRODUCTIVITY & NO-SHOW CHECKS
// ============================================

// No-Show Check - Alle 2 Stunden während Arbeitszeit
async function runNoShowCheck() {
  logger.info('⚠️ Starte No-Show Check...');
  try {
    const result = await meetingQualityService.checkNoShows();
    if (result.noShows.length > 0) {
      logger.warn(`⚠️ ${result.noShows.length} No-Shows gefunden`);
      // Alerts für jeden No-Show senden
      for (const noShow of result.noShows) {
        await meetingQualityService.sendNoShowAlert(noShow);
      }
    } else {
      logger.info('✅ Keine No-Shows gefunden');
    }
    return result;
  } catch (error) {
    logger.error('No-Show Check Fehler', { error: error.message });
    throw error;
  }
}

const noShowCheckJob = cron.schedule('0 10,12,14,16 * * 1-5', async () => {
  await runNoShowCheck();
}, { timezone: 'Europe/Berlin' });
logger.info('⚠️ No-Show Check Job: Werktags 10, 12, 14, 16 Uhr');

// Produktivitäts-Report - Täglich um 17:30 Uhr
async function runProductivityReport() {
  logger.info('📊 Starte Produktivitäts-Report...');
  try {
    const result = await meetingQualityService.sendProductivityReport();
    logger.info('✅ Produktivitäts-Report gesendet', { 
      active: result.activity.summary.active,
      inactive: result.activity.summary.inactive
    });
    return result;
  } catch (error) {
    logger.error('Produktivitäts-Report Fehler', { error: error.message });
    throw error;
  }
}

const productivityReportJob = cron.schedule('30 17 * * 1-5', async () => {
  await runProductivityReport();
}, { timezone: 'Europe/Berlin' });
logger.info('📊 Productivity Report Job: Werktags 17:30 Uhr');

// Inaktivitäts-Reminder - Täglich um 14:00 Uhr (gibt Zeit für Nachmittags-Meetings)
async function runInactivityReminders() {
  logger.info('📧 Starte Inaktivitäts-Reminder...');
  try {
    const result = await meetingQualityService.sendAllInactivityReminders();
    logger.info('✅ Inaktivitäts-Reminder gesendet', { 
      sent: result.remindersSent,
      total: result.totalInactive
    });
    return result;
  } catch (error) {
    logger.error('Inaktivitäts-Reminder Fehler', { error: error.message });
    throw error;
  }
}

const inactivityReminderJob = cron.schedule('0 14 * * 1-5', async () => {
  await runInactivityReminders();
}, { timezone: 'Europe/Berlin' });
logger.info('📧 Inactivity Reminder Job: Werktags 14:00 Uhr');

// ============================================
// SALES AUTOMATION JOBS
// ============================================

// No-Show Reschedule - Täglich 9:00 Uhr
async function runNoShowReschedule() {
  logger.info('🔄 Starte No-Show Reschedule...');
  try {
    const result = await salesAutomationService.processNoShows();
    logger.info('✅ No-Show Reschedule abgeschlossen', { processed: result.processed });
    return result;
  } catch (error) {
    logger.error('No-Show Reschedule Fehler', { error: error.message });
    throw error;
  }
}

const noShowRescheduleJob = cron.schedule('0 9 * * 1-5', async () => {
  await runNoShowReschedule();
}, { timezone: 'Europe/Berlin' });
logger.info('🔄 No-Show Reschedule Job: Werktags 9:00 Uhr');

// Pre-Meeting Warm-Ups - Alle 2 Stunden
async function runWarmUps() {
  logger.info('📧 Starte Warm-Ups...');
  try {
    const result = await salesAutomationService.processPreMeetingWarmUps();
    logger.info('✅ Warm-Ups abgeschlossen', result);
    return result;
  } catch (error) {
    logger.error('Warm-Ups Fehler', { error: error.message });
    throw error;
  }
}

const warmUpJob = cron.schedule('0 8,10,12,14,16 * * 1-5', async () => {
  await runWarmUps();
}, { timezone: 'Europe/Berlin' });
logger.info('📧 Warm-Up Job: Werktags 8, 10, 12, 14, 16 Uhr');

// Deal-Closer Sequenzen - Täglich 10:00 und 15:00 Uhr
async function runDealClosers() {
  logger.info('🎯 Starte Deal-Closer Sequenzen...');
  try {
    const result = await salesAutomationService.processDealCloserSequences();
    logger.info('✅ Deal-Closer abgeschlossen', { processed: result.processed });
    return result;
  } catch (error) {
    logger.error('Deal-Closer Fehler', { error: error.message });
    throw error;
  }
}

const dealCloserJob = cron.schedule('0 10,15 * * 1-5', async () => {
  await runDealClosers();
}, { timezone: 'Europe/Berlin' });
logger.info('🎯 Deal-Closer Job: Werktags 10:00 und 15:00 Uhr');

// ============================================
// UNIFIED CRM PIPELINE
// ============================================

// Unified Sequenzen verarbeiten - Stündlich
async function runUnifiedSequences() {
  logger.info('🚀 Starte Unified Sequenzen...');
  try {
    const result = await pipelineService.processSequences();
    logger.info('✅ Unified Sequenzen abgeschlossen', { processed: result.processed, errors: result.errors });
    return result;
  } catch (error) {
    logger.error('Unified Sequenzen Fehler', { error: error.message });
    throw error;
  }
}

const unifiedSequenceJob = cron.schedule('0 9,10,11,12,13,14,15,16,17 * * 1-5', async () => {
  await runUnifiedSequences();
}, { timezone: 'Europe/Berlin' });
logger.info('🚀 Unified Sequence Job: Werktags stündlich 9-17 Uhr');

// ============================================
// CALL MANAGER - Tägliche Anruf-Liste
// ============================================

async function runDailyCallManager() {
  logger.info('📞 Starte Call Manager...');
  try {
    const callList = await callManagerService.generateCallList({ limit: 15, minPriority: 'high' });
    logger.info('📞 Call List generiert', { total: callList.callsRecommended });
    
    // Zendesk Tasks für dringende Anrufe erstellen
    if (callList.calls.length > 0) {
      const tasks = await callManagerService.createCallTasks(callList);
      logger.info('✅ Zendesk Call Tasks erstellt', { created: tasks.created });
    }
    
    return callList;
  } catch (error) {
    logger.error('Call Manager Fehler', { error: error.message });
    throw error;
  }
}

// Täglich 8:30 Uhr - Anruf-Liste für den Tag
const callManagerJob = cron.schedule('30 8 * * 1-5', async () => {
  await runDailyCallManager();
}, { timezone: 'Europe/Berlin' });
logger.info('📞 Call Manager Job: Werktags 8:30 Uhr');

// Export für manuelle Ausführung und Status-Check
export { 
  runCampaignBatch, campaignJob, 
  noShowEmailJob, 
  runSequenceProcessor, sequenceJob,
  runReengagementProcessor, reengagementJob,
  runReplySync, replySyncJob,
  dailyReportJob,
  runHealthCheck, healthCheckJob,
  runLeadOutreach, leadOutreachJob,
  runHotLeadScan, hotLeadJob,
  runMultiLeadSequences, multiLeadJob,
  runLeadquelleGeneration, leadquelleGenerationJob,
  runStartupCatchup,
  runTeamReport, dailyTeamReportJob, weeklyTeamReportJob,
  runNoShowCheck, noShowCheckJob,
  runProductivityReport, productivityReportJob,
  runInactivityReminders, inactivityReminderJob,
  runNoShowReschedule, noShowRescheduleJob,
  runWarmUps, warmUpJob,
  runDealClosers, dealCloserJob,
  runUnifiedSequences, unifiedSequenceJob,
  runDailyCallManager, callManagerJob
};
