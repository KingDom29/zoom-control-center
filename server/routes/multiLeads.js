/**
 * Multi-Branchen Lead Generation API Routes
 * Lead-Fabrik für alle Branchen
 */

import express from 'express';
import { multiLeadService, BRANCHES } from '../services/multiLeadService.js';
import logger from '../utils/logger.js';

const router = express.Router();

// GET /api/multi-leads/branches - Alle verfügbaren Branchen
router.get('/branches', (req, res) => {
  res.json({
    success: true,
    count: Object.keys(BRANCHES).length,
    branches: multiLeadService.getBranches()
  });
});

// GET /api/multi-leads/branches/:id - Einzelne Branche
router.get('/branches/:id', (req, res) => {
  const branch = multiLeadService.getBranch(req.params.id);
  if (!branch) {
    return res.status(404).json({ success: false, error: 'Branche nicht gefunden' });
  }
  res.json({ success: true, branch });
});

// POST /api/multi-leads/search - Leads suchen
router.post('/search', async (req, res) => {
  try {
    const { branch, city, radius = 20000 } = req.body;
    
    if (!branch || !city) {
      return res.status(400).json({ success: false, error: 'branch und city erforderlich' });
    }

    const leads = await multiLeadService.searchLeads(branch, city, radius);
    
    res.json({
      success: true,
      branch,
      city,
      count: leads.length,
      leads
    });
  } catch (error) {
    logger.error('Multi-Lead Search Fehler', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/multi-leads/import - Lead importieren (mit Details + E-Mail scrapen)
router.post('/import', async (req, res) => {
  try {
    const { placeId, branch, city } = req.body;
    
    if (!placeId || !branch) {
      return res.status(400).json({ success: false, error: 'placeId und branch erforderlich' });
    }

    // Details abrufen
    const details = await multiLeadService.getPlaceDetails(placeId);
    if (!details) {
      return res.status(404).json({ success: false, error: 'Place nicht gefunden' });
    }

    // E-Mail scrapen
    let email = null;
    if (details.website) {
      email = await multiLeadService.scrapeEmail(details.website);
    }

    // Lead speichern
    const result = multiLeadService.saveLead({
      ...details,
      branch,
      city: city || details.address,
      email
    });

    if (!result.success) {
      return res.status(409).json({ success: false, error: 'Lead existiert bereits' });
    }

    res.status(201).json({
      success: true,
      lead: result.lead,
      hasEmail: !!email
    });
  } catch (error) {
    logger.error('Multi-Lead Import Fehler', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/multi-leads/bulk-import - Mehrere Leads importieren
router.post('/bulk-import', async (req, res) => {
  try {
    const { leads } = req.body; // Array von { placeId, branch, city }
    
    if (!leads || !Array.isArray(leads)) {
      return res.status(400).json({ success: false, error: 'leads Array erforderlich' });
    }

    const results = { imported: 0, skipped: 0, errors: 0, details: [] };

    for (const item of leads) {
      try {
        const details = await multiLeadService.getPlaceDetails(item.placeId);
        if (!details) {
          results.errors++;
          continue;
        }

        let email = null;
        if (details.website) {
          email = await multiLeadService.scrapeEmail(details.website);
        }

        const result = multiLeadService.saveLead({
          ...details,
          branch: item.branch,
          city: item.city || details.address,
          email
        });

        if (result.success) {
          results.imported++;
          results.details.push({ company: details.company, email, status: 'imported' });
        } else {
          results.skipped++;
        }

        await new Promise(r => setTimeout(r, 300)); // Rate limiting
      } catch (e) {
        results.errors++;
      }
    }

    res.json({ success: true, ...results });
  } catch (error) {
    logger.error('Multi-Lead Bulk Import Fehler', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/multi-leads/:id/send - E-Mail an Lead senden
router.post('/:id/send', async (req, res) => {
  try {
    const result = await multiLeadService.sendOutreachEmail(req.params.id);
    res.json(result);
  } catch (error) {
    logger.error('Multi-Lead Send Fehler', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/multi-leads/track/:token - Tracking (Booking-Klick)
router.get('/track/:token', (req, res) => {
  const { redirect } = req.query;
  const result = multiLeadService.trackAction(req.params.token);
  
  if (result && redirect) {
    res.redirect(redirect);
  } else if (result) {
    res.json({ success: true, message: 'Tracked' });
  } else {
    res.status(404).json({ success: false, error: 'Token ungültig' });
  }
});

// GET /api/multi-leads/optout/:token - Opt-Out
router.get('/optout/:token', (req, res) => {
  const success = multiLeadService.optOut(req.params.token);
  
  if (success) {
    res.send(`
      <html>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
          <h2>✅ Erfolgreich abgemeldet</h2>
          <p>Sie erhalten keine weiteren E-Mails von uns.</p>
        </body>
      </html>
    `);
  } else {
    res.status(404).send('Token ungültig');
  }
});

// GET /api/multi-leads/stats - Statistiken
router.get('/stats', (req, res) => {
  const stats = multiLeadService.getStats();
  res.json({ success: true, ...stats });
});

// GET /api/multi-leads/by-branch/:branch - Leads einer Branche
router.get('/by-branch/:branch', (req, res) => {
  const { status } = req.query;
  const leads = multiLeadService.getLeadsByBranch(req.params.branch, status);
  res.json({
    success: true,
    branch: req.params.branch,
    count: leads.length,
    leads
  });
});

// POST /api/multi-leads/search-and-import - Suchen + automatisch importieren
router.post('/search-and-import', async (req, res) => {
  try {
    const { branch, city, limit = 20 } = req.body;
    
    if (!branch || !city) {
      return res.status(400).json({ success: false, error: 'branch und city erforderlich' });
    }

    // Suchen
    const searchResults = await multiLeadService.searchLeads(branch, city);
    const toImport = searchResults.slice(0, limit);

    // Importieren
    const results = { found: searchResults.length, imported: 0, withEmail: 0 };

    for (const item of toImport) {
      const details = await multiLeadService.getPlaceDetails(item.placeId);
      if (!details) continue;

      let email = null;
      if (details.website) {
        email = await multiLeadService.scrapeEmail(details.website);
        if (email) results.withEmail++;
      }

      const result = multiLeadService.saveLead({
        ...details,
        branch,
        city,
        email
      });

      if (result.success) results.imported++;
      await new Promise(r => setTimeout(r, 300));
    }

    res.json({
      success: true,
      branch,
      city,
      ...results
    });
  } catch (error) {
    logger.error('Search-and-Import Fehler', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
