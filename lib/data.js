// Data access with caching, so a dashboard request no longer re-downloads
// every lead and every ad row from three external APIs.

const axios = require('axios');
const { cached } = require('./cache');
const { getAllDatesInRange } = require('./aggregate');
const facebook = require('../facebook_Ads');
const google = require('../googleAds');

const MIN = 60 * 1000;
const LEADS_TTL_MS = Number(process.env.LEADS_TTL_MS || 10 * MIN);
const LEADS_MAX_STALE_MS = Number(process.env.LEADS_MAX_STALE_MS || 6 * 60 * MIN);
const LEADS_WAIT_MS = Number(process.env.LEADS_WAIT_MS || 8000);
// The Zoho function takes ~25-30s for ~8,500 leads. Allow longer than API Gateway's 29s: if a
// cold container's first load outlives the gateway, the Lambda still finishes it and caches it.
// Needs the Lambda timeout set above this (60s).
const ZOHO_TIMEOUT_MS = Number(process.env.ZOHO_TIMEOUT_MS || 55000);
// The scheduled warm-up refreshes leads once they are older than this, so user requests
// normally find a copy younger than LEADS_TTL_MS and never wait for Zoho.
const WARM_LEADS_REFRESH_MS = Number(process.env.WARM_LEADS_REFRESH_MS || 4 * MIN);
const SPEND_TTL_MS = Number(process.env.SPEND_TTL_MS || 10 * MIN);
// Ad platforms can still adjust the last couple of days; older days are treated as final.
const SPEND_FINAL_AFTER_DAYS = Number(process.env.SPEND_FINAL_AFTER_DAYS || 3);

// ---------- Zoho leads ----------

async function loadZohoOutput() {
  const started = Date.now();
  const resp = await axios.get(process.env.ZOHO_API, { timeout: ZOHO_TIMEOUT_MS });
  const output = JSON.parse(resp.data.details.output);
  console.log(`[zoho] loaded ${output.leads_data?.length ?? 0} leads in ${Date.now() - started}ms`);
  return output;
}

/** @returns {Promise<{value:object, fetchedAt:number, stale:boolean}>} */
function getZohoOutput({ ttlMs = LEADS_TTL_MS } = {}) {
  return cached('zoho', loadZohoOutput, {
    ttlMs,
    maxStaleMs: LEADS_MAX_STALE_MS,
    waitMs: LEADS_WAIT_MS,
  });
}

// ---------- Daily ad spend ----------

const SOURCES = { facebook: facebook.getDailySpend, google: google.getDailySpend };
const spendStore = { facebook: new Map(), google: new Map() }; // date -> {rows:[{campaign,cost,clicks}], fetchedAt}
const inflight = new Map();

function istToday() {
  return new Date(Date.now() + 330 * MIN).toISOString().slice(0, 10);
}

function finalCutoff() {
  const d = new Date(istToday());
  d.setDate(d.getDate() - SPEND_FINAL_AFTER_DAYS);
  return d.toISOString().slice(0, 10);
}

async function fetchIntoStore(source, from, to) {
  const key = `${source}:${from}:${to}`;
  if (!inflight.has(key)) {
    const p = (async () => {
      const started = Date.now();
      const rows = await SOURCES[source](from, to);
      const fetchedAt = Date.now();
      const store = spendStore[source];
      // Days with no rows had no spend; store them empty so they are not re-fetched.
      for (const d of getAllDatesInRange(new Date(from), new Date(to))) {
        store.set(d, { rows: [], fetchedAt });
      }
      for (const r of rows) {
        const day = store.get(r.date) || { rows: [], fetchedAt };
        day.rows.push({ campaign: r.campaign || '', cost: r.cost, clicks: r.clicks });
        store.set(r.date, day);
      }
      console.log(`[${source}] fetched ${from}..${to} (${rows.length} rows) in ${fetchedAt - started}ms`);
    })().finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return inflight.get(key);
}

/**
 * Daily spend for [startDate, endDate]. Only days that are missing, or recent and
 * older than SPEND_TTL_MS, are fetched from the ad platform.
 * @returns {Promise<{rows:Array<{date,campaign,cost,clicks}>, error:string|null}>}
 */
async function getSpend(source, startDate, endDate) {
  const store = spendStore[source];
  const dates = getAllDatesInRange(new Date(startDate), new Date(endDate));
  const cutoff = finalCutoff();
  const now = Date.now();

  const needed = dates.filter((d) => {
    const e = store.get(d);
    if (!e) return true;
    return d > cutoff && now - e.fetchedAt >= SPEND_TTL_MS;
  });

  let error = null;
  if (needed.length) {
    try {
      await fetchIntoStore(source, needed[0], needed[needed.length - 1]);
    } catch (err) {
      error = err.message;
    }
  }

  const rows = [];
  let missingDays = 0;
  for (const d of dates) {
    const e = store.get(d);
    if (!e) { missingDays++; continue; }
    for (const r of e.rows) rows.push({ date: d, ...r });
  }
  // If some days could not be loaded at all, the totals are incomplete – say so.
  if (error && missingDays) {
    error = `${error} (${missingDays} of ${dates.length} days missing)`;
  } else if (error) {
    error = `${error} (showing cached values)`;
  }
  return { rows, error };
}

/** Pre-load caches; called by the scheduled warm-up. */
async function warm({ days = 400 } = {}) {
  const end = istToday();
  const startD = new Date(end);
  startD.setDate(startD.getDate() - days);
  const start = startD.toISOString().slice(0, 10);
  const results = await Promise.allSettled([
    getZohoOutput({ ttlMs: WARM_LEADS_REFRESH_MS }),
    getSpend('facebook', start, end),
    getSpend('google', start, end),
  ]);
  return {
    zoho: results[0].status === 'fulfilled' ? 'ok' : results[0].reason.message,
    facebook: results[1].status === 'fulfilled' ? (results[1].value.error || 'ok') : results[1].reason.message,
    google: results[2].status === 'fulfilled' ? (results[2].value.error || 'ok') : results[2].reason.message,
  };
}

module.exports = { getZohoOutput, getSpend, warm, istToday };
