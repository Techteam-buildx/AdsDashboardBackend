const { GoogleAdsApi } = require('google-ads-api');
const axios = require('axios')

// console.log(GoogleAdsApi);

const client = new GoogleAdsApi({
  client_id: process.env.GOOGLE_CLIENT_ID,
  client_secret: process.env.GOOGLE_CLIENT_SECRET,
  developer_token: process.env.GOOGLE_DEVELOPER_TOKEN,
});

const customer = client.Customer({
  customer_id: process.env.GOOGLE_CUSTOMER_ID,          // e.g., '1234567890'
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,      
});

let accessToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
  const now = Date.now();

  if (!accessToken || now >= tokenExpiry) {
    try {
      const response = await axios.post(
        'https://oauth2.googleapis.com/token',
        null,
        {
          params: {
            client_id: process.env.GOOGLE_CLIENT_ID,
            client_secret: process.env.GOOGLE_CLIENT_SECRET,
            refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
            grant_type: 'refresh_token'
          }
        }
      );

      accessToken = response.data.access_token;
      tokenExpiry = now + response.data.expires_in * 1000 - 5 * 60 * 1000; // ⏱ refresh 5 mins early

      console.log("✅ Access token refreshed at", new Date().toISOString());
    } catch (err) {
      console.error("❌ Failed to refresh token:", err.response?.data || err.message);
    }
  }

  return accessToken;
}

module.exports = {getAccessToken};