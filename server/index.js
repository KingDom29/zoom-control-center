import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import logger from './utils/logger.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createServer } from 'http';
import { RealtimeServer } from './websocket/realtimeServer.js';
import { ZoomWebhookHandler } from './webhooks/zoomWebhookHandler.js';
import meetingsRouter from './routes/meetings.js';
import usersRouter from './routes/users.js';
import recordingsRouter from './routes/recordings.js';
import reportsRouter from './routes/reports.js';
import settingsRouter from './routes/settings.js';
import dashboardRouter from './routes/dashboard.js';
import leadsRouter from './routes/leads.js';
import maklerFinderRouter from './routes/maklerFinder.js';
import meetingTemplatesRouter from './routes/meetingTemplates.js';
import emailsRouter from './routes/emails.js';
import campaignRouter from './routes/campaign.js';
import healthRouter from './routes/health.js';
import './jobs/campaignScheduler.js';
import { campaignService } from './services/campaignService.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3001;

// Rate Limiters
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // 500 requests per window
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 120, // 120 webhook calls per minute
});

// Initialize enhanced WebSocket Server
const realtimeServer = new RealtimeServer(server, { path: '/ws' });

// Initialize Webhook Handler
const webhookHandler = new ZoomWebhookHandler(process.env.ZOOM_SECRET_TOKEN);

// Register handler to broadcast events via WebSocket
webhookHandler.on('*', (event) => {
  const formattedEvent = ZoomWebhookHandler.formatEventForUI(event);
  realtimeServer.broadcast(formattedEvent);
});

// Register handler for meeting.ended to track attendance
webhookHandler.on('meeting.ended', async (event) => {
  try {
    const meetingId = event.payload?.object?.id;
    const participants = event.payload?.object?.participants || [];
    
    if (meetingId) {
      const result = await campaignService.processMeetingEnd(meetingId, participants);
      if (result) {
        logger.info(`📊 Attendance tracked: ${result.email} = ${result.attendanceStatus}`);
      }
    }
  } catch (error) {
    logger.error('Error processing meeting.ended for attendance:', { error: error.message });
  }
});

// Make realtimeServer and webhookHandler available to routes
app.locals.realtimeServer = realtimeServer;
app.locals.webhookHandler = webhookHandler;

app.use(cors());
app.use(express.json());

// Apply rate limiters
app.use('/api/', apiLimiter);
app.use('/api/webhooks', webhookLimiter);

// Health check routes (no rate limit)
app.use('/api/health', healthRouter);

// API Routes
app.use('/api/meetings', meetingsRouter);
app.use('/api/users', usersRouter);
app.use('/api/recordings', recordingsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/leads', leadsRouter);
app.use('/api/makler-finder', maklerFinderRouter);
app.use('/api/meeting-templates', meetingTemplatesRouter);
app.use('/api/emails', emailsRouter);
app.use('/api/campaign', campaignRouter);

// Enhanced Webhook Routes
app.post('/api/webhooks', async (req, res) => {
  const { event, payload, event_ts } = req.body;
  
  // Handle Zoom URL validation
  if (event === 'endpoint.url_validation') {
    const response = webhookHandler.generateChallengeResponse(req.body.payload.plainToken);
    return res.json(response);
  }
  
  // Process the event
  try {
    await webhookHandler.processEvent(req.body);
    logger.info(`📥 Webhook received: ${event}`);
    res.status(200).json({ status: 'received' });
  } catch (error) {
    logger.error('Webhook processing error:', { error: error.message });
    res.status(500).json({ error: 'Processing failed' });
  }
});

// Get webhook event history
app.get('/api/webhooks/events', (req, res) => {
  const { limit = 50, event_type } = req.query;
  const events = webhookHandler.getEventHistory(parseInt(limit), event_type).map((e) => ({
    id: e.id,
    event: e.type,
    payload: e.payload,
    timestamp: e.timestamp,
    received_at: e.receivedAt
  }));
  res.json({ events, total: events.length });
});

app.get('/api/webhooks/event-types', (req, res) => {
  res.json({
    event_types: [
      {
        category: 'Meeting',
        events: [
          'meeting.started',
          'meeting.ended',
          'meeting.participant_joined',
          'meeting.participant_left',
          'meeting.created',
          'meeting.updated',
          'meeting.deleted'
        ]
      },
      {
        category: 'Recording',
        events: [
          'recording.started',
          'recording.stopped',
          'recording.completed',
          'recording.trashed',
          'recording.deleted',
          'recording.recovered'
        ]
      },
      {
        category: 'User',
        events: [
          'user.created',
          'user.updated',
          'user.deleted',
          'user.activated',
          'user.deactivated'
        ]
      },
      {
        category: 'Webinar',
        events: [
          'webinar.started',
          'webinar.ended',
          'webinar.participant_joined',
          'webinar.participant_left'
        ]
      }
    ]
  });
});

app.delete('/api/webhooks/events', (req, res) => {
  webhookHandler.clearEventHistory();
  res.json({ success: true });
});

// WebSocket stats
app.get('/api/webhooks/stats', (req, res) => {
  res.json(realtimeServer.getStats());
});

// Connected clients
app.get('/api/webhooks/clients', (req, res) => {
  res.json(realtimeServer.getConnectedClients());
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(join(__dirname, '../client/dist')));
  app.get('*', (req, res) => {
    res.sendFile(join(__dirname, '../client/dist/index.html'));
  });
}

server.listen(PORT, () => {
  logger.info(`🚀 Zoom Control Center running on http://localhost:${PORT}`);
  logger.info(`📡 WebSocket server ready on ws://localhost:${PORT}/ws`);
});

// Graceful Shutdown Handler
const gracefulShutdown = async (signal) => {
  logger.info(`${signal} received. Starting graceful shutdown...`);
  
  server.close(() => {
    logger.info('HTTP server closed');
  });

  try {
    campaignService.saveCampaign();
    logger.info('Campaign data saved');
  } catch (e) {
    logger.error('Failed to save campaign data', { error: e.message });
  }

  logger.info('Graceful shutdown completed');
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  gracefulShutdown('uncaughtException');
});
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason: String(reason) });
});
