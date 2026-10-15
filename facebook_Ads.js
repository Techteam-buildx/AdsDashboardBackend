const axios = require('axios');

const accessToken = process.env.FACEBOOK_ACCESS_TOKEN;
const adAccountId = process.env.FACEBOOK_AD_ACCOUNT_ID;
const GRAPH_VERSION = process.env.FACEBOOK_GRAPH_VERSION || 'v22.0';
const REQUEST_TIMEOUT_MS = Number(process.env.FACEBOOK_TIMEOUT_MS || 15000);

/**
 * Daily spend + clicks per campaign (campaign names are used for the City filter).
 * Campaign level returns one row per campaign per day (instead of one per ad per day),
 * with a page size of 500.
 * Throws on failure so the caller can report it instead of showing 0 spend.
 *
 * @returns {Promise<Array<{date:string, campaign:string, cost:number, clicks:number}>>}
 */
const getDailySpend = async (startDate, endDate) => {
  const timeRange = JSON.stringify({ since: startDate, until: endDate });

  let nextPage = `https://graph.facebook.com/${GRAPH_VERSION}/${adAccountId}/insights?` +
    `fields=date_start,campaign_name,clicks,spend` +
    `&time_range=${encodeURIComponent(timeRange)}` +
    `&time_increment=1&level=campaign&limit=500&access_token=${accessToken}`;

  const rows = [];
  try {
    while (nextPage) {
      const { data } = await axios.get(nextPage, { timeout: REQUEST_TIMEOUT_MS });
      for (const r of data.data || []) {
        rows.push({
          date: r.date_start,
          campaign: r.campaign_name || '',
          cost: parseFloat(r.spend || '0'),
          clicks: parseInt(r.clicks || '0', 10),
        });
      }
      nextPage = data.paging?.next || null;
    }
  } catch (error) {
    const detail = error.response?.data?.error?.message || error.message;
    console.error('Error fetching Facebook Ads data:', detail);
    throw new Error(`Meta Ads: ${detail}`);
  }
  return rows;
};

module.exports = { getDailySpend };
