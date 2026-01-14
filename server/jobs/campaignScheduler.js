import cron from 'node-cron';
import { campaignService } from '../services/campaignService.js';
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

// Export für manuelle Ausführung und Status-Check
export { runCampaignBatch, campaignJob, noShowEmailJob };
