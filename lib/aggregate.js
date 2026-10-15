// Pure aggregation of Zoho leads + daily ad spend into the dashboard payload.
// Keeps the exact response shape (and counting rules) of the original
// /app/leads and /app/leads/meetingfilter handlers so the deployed widget keeps working.

const PER_REFERRAL_COST = 50000;
const CP_LEAD_COMMISSION = 0.025;

function getAllDatesInRange(start, end) {
  const dates = [];
  const current = new Date(start);
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function inRange(start, end, date) {
  return start <= date && end >= date;
}

function newDay() {
  return { budget: 0, meetings_done: 0, qualified: 0, future_qualified: 0, leads_count: 0, converted: 0, clicks: 0 };
}

function newTotals() {
  return { cost: 0, clicks: 0, meetings_done: 0, qualified: 0, future_qualified: 0, leads_count: 0, converted: 0 };
}

function hasValidMobile(lead) {
  return lead.mobile?.length > 9 && lead.mobile?.length < 14;
}

// Which dashboard bucket a lead belongs to. Leads with no source (and Direct Call)
// are counted under Google, as in the original implementation.
function bucketFor(source) {
  if (source === 'Google AdWords' || source === 'Direct Call' || !source) return 'google';
  if (source === 'Meta Ads') return 'facebook';
  if (source === 'Referral Lead') return 'referral';
  if (source === 'CP Lead') return 'cplead';
  return null;
}

/**
 * @param {object} p
 * @param {Array}  p.leads        leads_data from the Zoho function
 * @param {Array}  p.googleSpend  [{date:'YYYY-MM-DD', cost:Number, clicks:Number}]
 * @param {Array}  p.facebookSpend same shape as googleSpend
 * @param {string} p.startDate    'YYYY-MM-DD' (lead generation range)
 * @param {string} p.endDate
 * @param {string} [p.meetingStartDate] optional meeting-date filter
 * @param {string} [p.meetingEndDate]
 */
function buildLeadsResponse({ leads, googleSpend, facebookSpend, startDate, endDate, meetingStartDate, meetingEndDate }) {
  const start = new Date(startDate);
  const end = new Date(endDate);

  let rows = Array.isArray(leads) ? leads : [];
  if (meetingStartDate && meetingEndDate) {
    const mstart = new Date(meetingStartDate);
    const mend = new Date(meetingEndDate);
    rows = rows.filter((item) => item.meetingdate && inRange(mstart, mend, new Date(item.meetingdate)));
  }

  const days = { google: {}, facebook: {}, referral: {}, cplead: {} };
  const totals = { google: newTotals(), facebook: newTotals(), referral: newTotals(), cplead: newTotals() };
  const dayFor = (bucket, dateStr) => (days[bucket][dateStr] ||= newDay());

  for (const x of rows) {
    const leadDate = new Date(x.date);
    if (!inRange(start, end, leadDate)) continue;
    const bucket = bucketFor(x.source);
    if (!bucket) continue;

    const dateStr = leadDate.toISOString().split('T')[0];
    const day = dayFor(bucket, dateStr);
    const tot = totals[bucket];

    // Google counts every lead; other sources only count leads with a plausible mobile number.
    if (bucket === 'google' || hasValidMobile(x)) { day.leads_count++; tot.leads_count++; }
    if (x.iss === 'Meeting Done') { day.meetings_done++; tot.meetings_done++; }
    if (x.qs === 'Qualified') { day.qualified++; tot.qualified++; }
    if (x.qs === 'Future Qualified') { day.future_qualified++; tot.future_qualified++; }
    if (x.converted === 'Converted') {
      day.converted++;
      tot.converted++;
      let cost = 0;
      if (bucket === 'referral') cost = PER_REFERRAL_COST;
      if (bucket === 'cplead') cost = x.cpbudget ? Number(x.cpbudget) * CP_LEAD_COMMISSION : 0;
      day.budget += cost;
      tot.cost += cost;
    }
  }

  const addSpend = (bucket, spendRows) => {
    for (const row of spendRows || []) {
      const adDate = new Date(row.date);
      if (!inRange(start, end, adDate)) continue;
      const day = dayFor(bucket, adDate.toISOString().split('T')[0]);
      day.budget += row.cost;
      day.clicks += row.clicks;
      totals[bucket].cost += row.cost;
      totals[bucket].clicks += row.clicks;
    }
  };
  addSpend('google', googleSpend);
  addSpend('facebook', facebookSpend);

  const labels = getAllDatesInRange(start, end);
  const series = (bucket, field) => labels.map((d) => days[bucket][d]?.[field] || 0);
  const ratio = (a, b) => (b ? a / b : 0);
  const sumSeries = (a, b) => a.map((v, i) => v + b[i]);

  const out = { labels };

  for (const bucket of ['google', 'facebook']) {
    const t = totals[bucket];
    Object.assign(out, {
      [`${bucket}_budget`]: t.cost,
      [`${bucket}_clicks`]: t.clicks,
      [`${bucket}_leads`]: t.leads_count,
      [`${bucket}_qualified`]: t.qualified,
      [`${bucket}_future_qualified`]: t.future_qualified,
      [`${bucket}_converted`]: t.converted,
      [`${bucket}_meetings_done`]: t.meetings_done,
      [`cpl_${bucket}`]: ratio(t.cost, t.leads_count),
      [`cpm_${bucket}`]: ratio(t.cost, t.meetings_done),
      [`lpq_${bucket}`]: ratio(t.leads_count, t.qualified),
      [`lpc_${bucket}`]: ratio(t.cost, t.converted),
      [`${bucket}_budgetData`]: series(bucket, 'budget'),
      [`${bucket}_meetingsData`]: series(bucket, 'meetings_done'),
      [`${bucket}_qualifiedData`]: series(bucket, 'qualified'),
      [`${bucket}_leadsData`]: series(bucket, 'leads_count'),
      [`${bucket}_convertedData`]: series(bucket, 'converted'),
    });
  }

  // Socials = Google + Facebook
  const g = totals.google, f = totals.facebook;
  Object.assign(out, {
    socials_budget: g.cost + f.cost,
    socials_leads: g.leads_count + f.leads_count,
    socials_qualified: g.qualified + f.qualified,
    socials_future_qualified: g.future_qualified + f.future_qualified,
    socials_converted: g.converted + f.converted,
    socials_meetings_done: g.meetings_done + f.meetings_done,
    cpl_socials: ratio(g.cost + f.cost, g.leads_count + f.leads_count),
    cpm_socials: ratio(g.cost + f.cost, g.meetings_done + f.meetings_done),
    lpq_socials: ratio(g.leads_count + f.leads_count, g.qualified + f.qualified),
    lpc_socials: ratio(f.cost + g.cost, g.converted + f.converted),
    socials_budgetData: sumSeries(out.google_budgetData, out.facebook_budgetData),
    socials_meetingsData: sumSeries(out.google_meetingsData, out.facebook_meetingsData),
    socials_qualifiedData: sumSeries(out.google_qualifiedData, out.facebook_qualifiedData),
    socials_convertedData: sumSeries(out.google_convertedData, out.facebook_convertedData),
    socials_leadsData: sumSeries(out.google_leadsData, out.facebook_leadsData),
  });

  for (const bucket of ['referral', 'cplead']) {
    const t = totals[bucket];
    Object.assign(out, {
      [`${bucket}_budget`]: t.cost,
      [`${bucket}_leads`]: t.leads_count,
      [`${bucket}_qualified`]: t.qualified,
      [`${bucket}_future_qualified`]: t.future_qualified,
      [`${bucket}_converted`]: t.converted,
      [`${bucket}_meetings_done`]: t.meetings_done,
      [`cpl_${bucket}`]: bucket === 'referral'
        ? (t.converted > 0 ? PER_REFERRAL_COST : 0)
        : ratio(t.cost, t.leads_count),
      [`cpm_${bucket}`]: ratio(t.cost, t.meetings_done),
      [`lpc_${bucket}`]: ratio(t.cost, t.converted),
      [`${bucket}_budgetData`]: series(bucket, 'budget'),
      [`${bucket}_meetingsData`]: series(bucket, 'meetings_done'),
      [`${bucket}_qualifiedData`]: series(bucket, 'qualified'),
      [`${bucket}_leadsData`]: series(bucket, 'leads_count'),
      [`${bucket}_convertedData`]: series(bucket, 'converted'),
    });
  }

  return out;
}

const MEETING_KEYS = {
  google_meeting: 'google_meetings_data',
  facebook_meeting: 'facebook_meetings_data',
  socials_meeting: 'socials_meetings_data',
  referral_meeting: 'referral_meetings_data',
  cplead_meeting: 'cplead_meetings_data',
};

// Count meeting dates per source that fall within [startDate, endDate].
function countMeetings(output, startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const counts = {};
  for (const [key, field] of Object.entries(MEETING_KEYS)) {
    const list = output[field];
    counts[key] = Array.isArray(list)
      ? list.filter((d) => inRange(start, end, new Date(d))).length
      : 0;
  }
  return counts;
}

module.exports = { buildLeadsResponse, countMeetings, getAllDatesInRange };
