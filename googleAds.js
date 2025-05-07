const axios = require('axios');
const { getAccessToken } = require('./google_ads');


async function fetchAds(startDate, endDate) {
    try {
        const accessToken = await getAccessToken();
        const developerToken = process.env.DEVELOPER_TOKEN;
        const customerId = process.env.CUSTOMER_ID; // account which has ads and campaigns linked.
        const response = await axios.post(
            `https://googleads.googleapis.com/v19/customers/${customerId}/googleAds:searchStream`,
            {
                "query": `SELECT
                    segments.date,
                    ad_group_ad.ad.id,
                    ad_group_ad.ad.name,
                    campaign.name,
                    metrics.impressions,
                    metrics.clicks,
                    metrics.cost_micros
                FROM ad_group_ad
                WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
                AND ad_group_ad.status != 'REMOVED'
                ORDER BY segments.date DESC`
            },
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'developer-token': developerToken,
                    'Content-Type': 'application/json',
                }
            }
        );

        const ads = response.data;
        let data = [];
        for (let x of ads) {
            for (let y of x.results) {
                // console.log("element: ", y);
                data.push(y);
            }
        }
        // console.log("✅ Ads:", ads);
        return data;
    } catch (error) {
        console.error("❌ Error fetching ads:", error.response?.data || error.message);
    }
}

module.exports = { fetchAds };