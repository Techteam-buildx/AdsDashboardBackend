const axios = require('axios');

const accessToken = process.env.FACEBOOK_ACCESS_TOKEN;
const adAccountId = process.env.FACEBOOK_AD_ACCOUNT_ID;

const getAdInsights = async (startDate, endDate) => {
  const timeRange = JSON.stringify({
    since: startDate,
    until: endDate
  });

  let nextPage = `https://graph.facebook.com/v22.0/${adAccountId}/insights?` +
    `fields=date_start,date_stop,ad_id,ad_name,campaign_name,impressions,clicks,spend` +
    `&time_range=${encodeURIComponent(timeRange)}` +
    `&time_increment=1&level=ad&access_token=${accessToken}`;

  const allInsights = [];

  try {
    while (nextPage) {
      const response = await axios.get(nextPage);
      const data = response.data;
      if (data.data && data.data.length > 0) {
        allInsights.push(...data.data);
      }
      nextPage = data.paging?.next || null;
    }
    return allInsights;
  } catch (error) {
    console.error("Error fetching Facebook Ads data:", error.response?.data || error.message);
    return [];
  }
}

module.exports = { getAdInsights };