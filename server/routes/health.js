/**
 * Health Check Endpoints
 * For monitoring and Kubernetes probes
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Full health check
router.get('/', async (req, res) => {
  const checks = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    uptimeFormatted: formatUptime(process.uptime()),
    memory: {
      used: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`,
      total: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)} MB`
    },
    services: {}
  };

  // Check Campaign Data
  try {
    const dataPath = path.join(__dirname, '../data/campaign.json');
    if (fs.existsSync(dataPath)) {
      const stats = fs.statSync(dataPath);
      checks.services.campaignData = {
        status: 'ok',
        size: `${(stats.size / 1024 / 1024).toFixed(2)} MB`,
        lastModified: stats.mtime.toISOString()
      };
    } else {
      checks.services.campaignData = { status: 'no_data' };
    }
  } catch (e) {
    checks.services.campaignData = { status: 'error', message: e.message };
  }

  // Check Logs Directory
  try {
    const logsPath = path.join(__dirname, '../../logs');
    if (fs.existsSync(logsPath)) {
      const files = fs.readdirSync(logsPath);
      checks.services.logging = {
        status: 'ok',
        logFiles: files.length
      };
    } else {
      checks.services.logging = { status: 'no_logs_dir' };
    }
  } catch (e) {
    checks.services.logging = { status: 'error', message: e.message };
  }

  // Check environment
  checks.services.zoom = {
    status: process.env.ZOOM_CLIENT_ID ? 'configured' : 'not_configured'
  };
  checks.services.azure = {
    status: process.env.AZURE_CLIENT_ID ? 'configured' : 'not_configured'
  };

  // Overall status
  const hasErrors = Object.values(checks.services).some(s => s.status === 'error');
  checks.status = hasErrors ? 'degraded' : 'healthy';

  res.status(hasErrors ? 503 : 200).json(checks);
});

// Liveness probe (is the server running?)
router.get('/live', (req, res) => {
  res.status(200).json({ 
    status: 'alive', 
    timestamp: new Date().toISOString() 
  });
});

// Readiness probe (is the server ready to handle requests?)
router.get('/ready', async (req, res) => {
  try {
    const { campaignService } = await import('../services/campaignService.js');
    const isReady = campaignService.campaign && campaignService.campaign.contacts;
    res.status(isReady ? 200 : 503).json({ 
      ready: isReady,
      contactsLoaded: isReady ? campaignService.campaign.contacts.length : 0
    });
  } catch (e) {
    res.status(503).json({ ready: false, error: e.message });
  }
});

// Manual health check trigger (runs the full check with email alerts)
router.post('/check', async (req, res) => {
  try {
    const { runHealthCheck } = await import('../jobs/campaignScheduler.js');
    const result = await runHealthCheck();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper function
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);
  
  return parts.join(' ');
}

export default router;
