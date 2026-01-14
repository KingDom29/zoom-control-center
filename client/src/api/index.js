import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000
});

// Dashboard
export const getDashboardOverview = () => api.get('/dashboard/overview');
export const getQuickStats = () => api.get('/dashboard/quick-stats');
export const getLiveMeetings = () => api.get('/dashboard/metrics/meetings?type=live');

// Meetings
export const getMeetings = (type = 'scheduled') => api.get(`/meetings?type=${type}`);
export const getUpcomingMeetings = () => api.get('/meetings/upcoming');
export const getMeeting = (id) => api.get(`/meetings/${id}`);
export const createMeeting = (data) => api.post('/meetings', data);
export const updateMeeting = (id, data) => api.patch(`/meetings/${id}`, data);
export const deleteMeeting = (id) => api.delete(`/meetings/${id}`);
export const endMeeting = (id) => api.put(`/meetings/${id}/status`);

// Users
export const getUsers = (status = 'active') => api.get(`/users?status=${status}`);
export const getUser = (id) => api.get(`/users/${id}`);
export const getUserSettings = (id) => api.get(`/users/${id}/settings`);
export const updateUserSettings = (id, data) => api.patch(`/users/${id}/settings`, data);
export const createUser = (data) => api.post('/users', data);
export const updateUser = (id, data) => api.patch(`/users/${id}`, data);
export const deleteUser = (id) => api.delete(`/users/${id}`);

// Recordings
export const getRecordings = (from, to) => api.get(`/recordings${from && to ? `?from=${from}&to=${to}` : ''}`);
export const getRecording = (id) => api.get(`/recordings/${id}`);
export const deleteRecording = (id, action = 'trash') => api.delete(`/recordings/${id}?action=${action}`);
export const recoverRecording = (id) => api.put(`/recordings/${id}/status`);

// Reports
export const getDailyReport = (year, month) => api.get(`/reports/daily?year=${year}&month=${month}`);
export const getUsersReport = (from, to, type) => api.get(`/reports/users?from=${from}&to=${to}&type=${type}`);
export const getMeetingsReport = (from, to) => api.get(`/reports/meetings?from=${from}&to=${to}`);
export const getCloudRecordingReport = (from, to) => api.get(`/reports/cloud-recording?from=${from}&to=${to}`);

// Settings
export const getAccountSettings = () => api.get('/settings/account');
export const updateAccountSettings = (data) => api.patch('/settings/account', data);
export const getAccountInfo = () => api.get('/settings/account/info');
export const getSecuritySettings = () => api.get('/settings/security');
export const updateSecuritySettings = (data) => api.patch('/settings/security', data);

// Webhooks
export const getWebhookEvents = (limit = 50) => api.get(`/webhooks/events?limit=${limit}`);
export const getWebhookEventTypes = () => api.get('/webhooks/event-types');
export const clearWebhookEvents = () => api.delete('/webhooks/events');

export default api;
