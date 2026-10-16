const axios = require('axios');
const { getAccessToken } = require('./google_ads');

const API_VERSION = process.env.GOOGLE_ADS_API_VERSION || 'v23';
const REQUEST_TIMEOUT_MS = Number(process.env.GOOGLE_TIMEOUT_MS || 15000);
// 'ad_group_ad' matches the numbers the dashboard has always shown.
// 'customer' also includes spend that has no ad_group_ad row (e.g. Performance Max) –
// switch only after validating against the Google Ads UI.
const SPEND_RESOURCE = process.env.GOOGLE_SPEND_RESOURCE || 'ad_group_ad';

function buildQuery(startDate, endDate) {
  const where = [`segments.date BETWEEN '${startDate}' AND '${endDate}'`];
  if (SPEND_RESOURCE === 'ad_group_ad') where.push(`ad_group_ad.status != 'REMOVED'`);
  return `SELECT segments.date, campaign.name, metrics.clicks, metrics.cost_micros
          FROM ${SPEND_RESOURCE}
          WHERE ${where.join(' AND ')}`;
}

/**
 * Daily spend + clicks, summed per day and campaign. Throws on failure.
 * @returns {Promise<Array<{date:string, campaign:string, cost:number, clicks:number}>>}
 */
async function getDailySpend(startDate, endDate) {
  try {
    const accessToken = await getAccessToken();
    const customerId = process.env.GOOGLE_CUSTOMER_TOKEN; // account which has ads and campaigns linked.
    const response = await axios.post(
      `https://googleads.googleapis.com/${API_VERSION}/customers/${customerId}/googleAds:searchStream`,
      { query: buildQuery(startDate, endDate) },
      {
        timeout: REQUEST_TIMEOUT_MS,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'developer-token': process.env.GOOGLE_DEVELOPER_TOKEN,
          'Content-Type': 'application/json',
        },
      }
    );

    const rows = {};
    for (const chunk of response.data || []) {
      for (const r of chunk.results || []) {
        const date = r.segments.date;
        const campaign = r.campaign?.name || '';
        const key = `${date}|${campaign}`;
        rows[key] ||= { date, campaign, cost: 0, clicks: 0 };
        // int64 fields come back as strings in the REST API
        rows[key].cost += Number(r.metrics.costMicros || 0) / 1000000;
        rows[key].clicks += Number(r.metrics.clicks || 0);
      }
    }
    return Object.values(rows);
  } catch (error) {
    const detail = error.response?.data?.[0]?.error?.message
      || error.response?.data?.error?.message
      || error.message;
    console.error('Error fetching Google Ads data:', detail);
    throw new Error(`Google Ads: ${detail}`);
  }
}

module.exports = { getDailySpend, buildQuery };
