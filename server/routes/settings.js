import express from 'express';
import { zoomApi } from '../services/zoomAuth.js';

const router = express.Router();

// Get account settings
router.get('/account', async (req, res) => {
  try {
    const settings = await zoomApi('GET', '/accounts/me/settings');
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update account settings
router.patch('/account', async (req, res) => {
  try {
    await zoomApi('PATCH', '/accounts/me/settings', req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get account info
router.get('/account/info', async (req, res) => {
  try {
    const info = await zoomApi('GET', '/accounts/me');
    res.json(info);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get locked settings
router.get('/account/lock', async (req, res) => {
  try {
    const settings = await zoomApi('GET', '/accounts/me/lock_settings');
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update locked settings
router.patch('/account/lock', async (req, res) => {
  try {
    await zoomApi('PATCH', '/accounts/me/lock_settings', req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get meeting security settings
router.get('/security', async (req, res) => {
  try {
    const settings = await zoomApi('GET', '/accounts/me/settings');
    res.json({
      security: settings.security,
      meeting_security: settings.meeting_security
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update meeting security settings
router.patch('/security', async (req, res) => {
  try {
    await zoomApi('PATCH', '/accounts/me/settings', req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get branding settings
router.get('/branding', async (req, res) => {
  try {
    const settings = await zoomApi('GET', '/accounts/me/branding');
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get trusted domains
router.get('/trusted-domains', async (req, res) => {
  try {
    const domains = await zoomApi('GET', '/accounts/me/trusted_domains');
    res.json(domains);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get managed domains
router.get('/managed-domains', async (req, res) => {
  try {
    const domains = await zoomApi('GET', '/accounts/me/managed_domains');
    res.json(domains);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get virtual background settings
router.get('/virtual-backgrounds', async (req, res) => {
  try {
    const backgrounds = await zoomApi('GET', '/accounts/me/settings/virtual_backgrounds');
    res.json(backgrounds);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
