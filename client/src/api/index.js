/**
 * Zoom Control Center - Headless API Client
 * Backend automation - no UI dependencies
 */
import axios from 'axios';

const api = axios.create({ baseURL: '/api', timeout: 30000 });

// Retry on 5xx/network errors (max 2x)
api.interceptors.response.use(null, async err => {
  const cfg = err.config;
  if (!cfg || axios.isCancel(err)) return Promise.reject(err);
  cfg._retry = (cfg._retry || 0) + 1;
  if (cfg._retry <= 2 && (err.code === 'ERR_NETWORK' || err.response?.status >= 500)) {
    await new Promise(r => setTimeout(r, cfg._retry * 1000));
    return api(cfg);
  }
  return Promise.reject(err);
});

// Query helper
const q = p => { const s = new URLSearchParams(p).toString(); return s ? `?${s}` : ''; };

// Meetings
export const getMeetings = (type = 'scheduled') => api.get(`/meetings?type=${type}`);
export const getUpcomingMeetings = () => api.get('/meetings/upcoming');
export const getMeeting = id => api.get(`/meetings/${id}`);
export const createMeeting = data => api.post('/meetings', data);
export const updateMeeting = (id, data) => api.patch(`/meetings/${id}`, data);
export const deleteMeeting = id => api.delete(`/meetings/${id}`);

// Users
export const getUsers = (status = 'active') => api.get(`/users?status=${status}`);
export const getUser = id => api.get(`/users/${id}`);
export const createUser = data => api.post('/users', data);
export const updateUser = (id, data) => api.patch(`/users/${id}`, data);
export const deleteUser = id => api.delete(`/users/${id}`);

// Recordings
export const getRecordings = (from, to) => api.get(`/recordings${from && to ? `?from=${from}&to=${to}` : ''}`);
export const getRecording = id => api.get(`/recordings/${id}`);
export const deleteRecording = (id, action = 'trash') => api.delete(`/recordings/${id}?action=${action}`);

// Reports
export const getDailyReport = (year, month) => api.get(`/reports/daily?year=${year}&month=${month}`);
export const getMeetingsReport = (from, to) => api.get(`/reports/meetings?from=${from}&to=${to}`);

// Settings
export const getAccountSettings = () => api.get('/settings/account');
export const updateAccountSettings = data => api.patch('/settings/account', data);

// Webhooks
export const getWebhookEvents = (limit = 50) => api.get(`/webhooks/events?limit=${limit}`);
export const clearWebhookEvents = () => api.delete('/webhooks/events');

// Revenue
export const getRevenueEvents = (p = {}) => api.get(`/revenue/events${q(p)}`);
export const getRevenueStats = () => api.get('/revenue/stats');
export const getRevenueInsights = () => api.get('/revenue/insights');
export const generateFollowUp = data => api.post('/revenue/generate-followup', data);
export const analyzeMeeting = data => api.post('/revenue/analyze-meeting', data);

// Notifications
export const triggerNotificationAction = (type, data) => api.post(`/notifications/action/${type}`, data);

// Logs
export const getLogs = (p = {}) => api.get(`/logs${q(p)}`);
export const getLogHealth = () => api.get('/logs/health');

// System
export const getMetrics = () => api.get('/metrics');
export const getHealth = () => api.get('/health');

export default api;
