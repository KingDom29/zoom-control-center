import cron from 'node-cron';
import { campaignService } from '../services/campaignService.js';
import { sequenceEngine } from '../services/sequenceEngine.js';
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

// Export für manuelle Ausführung und Status-Check
export { 
  runCampaignBatch, campaignJob, 
  noShowEmailJob, 
  runSequenceProcessor, sequenceJob,
  runReengagementProcessor, reengagementJob,
  runReplySync, replySyncJob,
  dailyReportJob,
  runStartupCatchup
};
