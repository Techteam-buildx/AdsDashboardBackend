const axios = require('axios');

let accessToken = null;
let tokenExpiry = 0;
let refreshing = null;

async function refreshAccessToken() {
  const response = await axios.post(
    'https://oauth2.googleapis.com/token',
    null,
    {
      timeout: 10000,
      params: {
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
        grant_type: 'refresh_token'
      }
    }
  );
  accessToken = response.data.access_token;
  tokenExpiry = Date.now() + response.data.expires_in * 1000 - 5 * 60 * 1000; // ⏱ refresh 5 mins early
  console.log("✅ Access token refreshed at", new Date().toISOString());
}

async function getAccessToken() {
  if (!accessToken || Date.now() >= tokenExpiry) {
    if (!refreshing) {
      refreshing = refreshAccessToken().finally(() => { refreshing = null; });
    }
    try {
      await refreshing;
    } catch (err) {
      const detail = err.response?.data?.error_description || err.response?.data?.error || err.message;
      console.error("❌ Failed to refresh token:", detail);
      throw new Error(`token refresh failed: ${detail}`);
    }
  }
  return accessToken;
}

module.exports = {getAccessToken};
