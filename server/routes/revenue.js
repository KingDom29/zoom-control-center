/**
 * Revenue Events API Routes
 * Endpoints für Umsatz-Events, Statistiken und KI-Insights
 */

import { Router } from 'express';
import revenueEventProcessor, { REVENUE_EVENT_TYPES } from '../services/revenueEventProcessor.js';
import openaiService from '../services/openaiService.js';
import logger from '../utils/logger.js';

const router = Router();

/**
 * GET /api/revenue/events
 * Abrufen der Revenue-Events
 */
router.get('/events', (req, res) => {
  try {
    const { type, since, limit = 50 } = req.query;
    
    const events = revenueEventProcessor.getEvents({
      type,
      since,
      limit: parseInt(limit, 10)
    });

    res.json({
      success: true,
      count: events.length,
      events
    });
  } catch (error) {
    logger.error('Error fetching revenue events', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/revenue/stats
 * Umsatz-Statistiken abrufen
 */
router.get('/stats', (req, res) => {
  try {
    const stats = revenueEventProcessor.getStats();
    res.json({ success: true, stats });
  } catch (error) {
    logger.error('Error fetching revenue stats', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/revenue/overview
 * Dashboard Overview mit allen KPIs
 */
router.get('/overview', (req, res) => {
  try {
    const stats = revenueEventProcessor.getStats();
    const insights = revenueEventProcessor.getSuccessInsights();
    
    // Calculate conversion metrics
    const todayEvents = stats.today.byType || {};
    const weekEvents = stats.thisWeek.byType || {};
    
    const hotLeadsToday = (todayEvents['lead.hot'] || 0) + (todayEvents['sale.signal'] || 0);
    const hotLeadsWeek = (weekEvents['lead.hot'] || 0) + (weekEvents['sale.signal'] || 0);
    
    const conversionsToday = todayEvents['lead.converted'] || 0;
    const conversionsWeek = weekEvents['lead.converted'] || 0;
    
    const successfulMeetingsToday = todayEvents['meeting.success'] || 0;
    const successfulMeetingsWeek = weekEvents['meeting.success'] || 0;
    
    const totalMeetingsToday = successfulMeetingsToday + (todayEvents['meeting.noshow'] || 0);
    const totalMeetingsWeek = successfulMeetingsWeek + (weekEvents['meeting.noshow'] || 0);
    
    // Calculate trends (compare to previous period - simplified)
    const growthTrend = stats.thisWeek.total > 10 ? 
      Math.round((successfulMeetingsWeek / Math.max(totalMeetingsWeek, 1)) * 100) : 0;

    res.json({
      success: true,
      overview: {
        // Today's KPIs
        today: {
          hotLeads: hotLeadsToday,
          conversions: conversionsToday,
          successfulMeetings: successfulMeetingsToday,
          totalEvents: stats.today.total
        },
        // This Week's KPIs
        thisWeek: {
          hotLeads: hotLeadsWeek,
          conversions: conversionsWeek,
          successfulMeetings: successfulMeetingsWeek,
          totalEvents: stats.thisWeek.total,
          conversionRate: totalMeetingsWeek > 0 
            ? Math.round((successfulMeetingsWeek / totalMeetingsWeek) * 100) 
            : 0
        },
        // Trends
        trends: {
          growthTrend,
          isGrowing: growthTrend > 50,
          trendLabel: growthTrend > 70 ? 'Stark wachsend' : 
                      growthTrend > 50 ? 'Positiv' : 
                      growthTrend > 30 ? 'Stabil' : 'Optimierung nötig'
        },
        // AI Insights
        insights: {
          recommendation: insights.recommendation,
          bestDayOfWeek: insights.bestDayOfWeek,
          bestHour: insights.bestHour,
          avgEngagementRate: insights.avgEngagementRate,
          totalSuccessful: insights.totalSuccessful
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching revenue overview', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/revenue/insights
 * KI-Insights aus Pilz-Prinzip abrufen
 */
router.get('/insights', (req, res) => {
  try {
    const insights = revenueEventProcessor.getSuccessInsights();
    res.json({ success: true, insights });
  } catch (error) {
    logger.error('Error fetching insights', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/revenue/event-types
 * Verfügbare Event-Typen abrufen
 */
router.get('/event-types', (req, res) => {
  res.json({
    success: true,
    eventTypes: REVENUE_EVENT_TYPES
  });
});

/**
 * POST /api/revenue/generate-followup
 * KI-Follow-up E-Mail generieren
 */
router.post('/generate-followup', async (req, res) => {
  try {
    const { meetingTopic, hostName, participants, duration, notes } = req.body;

    if (!meetingTopic) {
      return res.status(400).json({
        success: false,
        error: 'meetingTopic ist erforderlich'
      });
    }

    const followUp = await openaiService.generateMeetingFollowUp({
      meetingTopic,
      hostName: hostName || 'Team',
      participants: participants || [],
      duration: duration || 30,
      notes
    });

    res.json({
      success: true,
      followUp,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error generating follow-up', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/revenue/generate-invitation
 * KI-Webinar-Einladung generieren
 */
router.post('/generate-invitation', async (req, res) => {
  try {
    const { webinarTopic, targetAudience, date, benefits } = req.body;

    if (!webinarTopic || !date) {
      return res.status(400).json({
        success: false,
        error: 'webinarTopic und date sind erforderlich'
      });
    }

    const invitation = await openaiService.generateWebinarInvitation({
      webinarTopic,
      targetAudience: targetAudience || 'Immobilienmakler',
      date,
      benefits: benefits || []
    });

    res.json({
      success: true,
      invitation,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error generating invitation', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/revenue/analyze-meeting
 * Meeting-Erfolg analysieren
 */
router.post('/analyze-meeting', async (req, res) => {
  try {
    const { meetingTopic, duration, participantCount, participantEngagement } = req.body;

    const analysis = await openaiService.analyzeMeetingSuccess({
      meetingTopic: meetingTopic || 'Meeting',
      duration: duration || 30,
      participantCount: participantCount || 2,
      participantEngagement: participantEngagement || {}
    });

    res.json({
      success: true,
      analysis,
      analyzedAt: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error analyzing meeting', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/revenue/generate-subjects
 * E-Mail-Betreffzeilen generieren
 */
router.post('/generate-subjects', async (req, res) => {
  try {
    const { context, tone } = req.body;

    if (!context) {
      return res.status(400).json({
        success: false,
        error: 'context ist erforderlich'
      });
    }

    const subjects = await openaiService.generateSubjectLine({
      context,
      tone: tone || 'professional'
    });

    res.json({
      success: true,
      subjects,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error generating subjects', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
