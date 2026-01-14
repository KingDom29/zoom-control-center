import axios from 'axios';
import NodeCache from 'node-cache';
import logger from '../utils/logger.js';

const tokenCache = new NodeCache();

export async function getAccessToken() {
  const cachedToken = tokenCache.get('zoom_access_token');
  if (cachedToken) {
    return cachedToken;
  }

  const credentials = Buffer.from(
    `${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`
  ).toString('base64');

  try {
    const response = await axios.post(
      'https://zoom.us/oauth/token',
      new URLSearchParams({
        grant_type: 'account_credentials',
        account_id: process.env.ZOOM_ACCOUNT_ID
      }),
      {
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const { access_token, expires_in } = response.data;
    // Cache token for slightly less than expiry time
    tokenCache.set('zoom_access_token', access_token, expires_in - 60);
    
    return access_token;
  } catch (error) {
    logger.error('Failed to get Zoom access token', { error: error.message, details: error.response?.data });
    throw new Error('Failed to authenticate with Zoom');
  }
}

export async function zoomApi(method, endpoint, data = null) {
  const token = await getAccessToken();
  
  try {
    const response = await axios({
      method,
      url: `https://api.zoom.us/v2${endpoint}`,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      data
    });
    return response.data;
  } catch (error) {
    logger.error(`Zoom API Error [${method} ${endpoint}]`, { error: error.message, details: error.response?.data });
    throw error;
  }
}
