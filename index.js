require('dotenv').config()
var express = require('express');
var bodyParser = require('body-parser');
var morgan = require('morgan');
const { buildLeadsResponse, countMeetings } = require('./lib/aggregate');
const { getZohoOutput, getSpend, warm } = require('./lib/data');

var expressApp = express();
var port = process.env.PORT || 5000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

expressApp.set('port', port);
expressApp.use(morgan('dev'));
expressApp.use(bodyParser.json());
expressApp.use(bodyParser.urlencoded({ extended: false }));

expressApp.use('/', function (req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  next();
});

expressApp.get('/test', (req, res) => {
  res.send("test ping received!")
})

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validDates(...dates) {
  return dates.every((d) => DATE_RE.test(d) && !isNaN(new Date(d)));
}

function sendError(res, status, message) {
  res.status(status).json({ error: message });
}

/**
 * Loads leads + spend for a lead-date range and builds the dashboard payload.
 * Ad-platform failures don't fail the request; they are reported in meta.errors
 * so the widget can show a warning instead of silently showing 0 spend.
 */
async function loadDashboard({ startDate, endDate, meetingStartDate, meetingEndDate }) {
  const started = Date.now();
  const [zoho, fb, google] = await Promise.all([
    getZohoOutput(),
    getSpend('facebook', startDate, endDate),
    getSpend('google', startDate, endDate),
  ]);

  const data = buildLeadsResponse({
    leads: zoho.value.leads_data,
    facebookSpend: fb.rows,
    googleSpend: google.rows,
    startDate,
    endDate,
    meetingStartDate,
    meetingEndDate,
  });

  const errors = {};
  if (fb.error) errors.facebook = fb.error;
  if (google.error) errors.google = google.error;
  if (zoho.stale) errors.leads = 'Lead data could not be refreshed; showing the last loaded copy.';

  const meta = {
    startDate,
    endDate,
    meetingStartDate: meetingStartDate || null,
    meetingEndDate: meetingEndDate || null,
    leadsAsOf: new Date(zoho.fetchedAt).toISOString(),
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    errors,
  };
  return { data, zohoOutput: zoho.value, meta };
}

function handleFailure(res, err) {
  console.error("Error API Call: ", err.message);
  sendError(res, 502, `Could not load dashboard data: ${err.message}`);
}

// Single call used by the widget: lead/spend metrics + meeting counts + meta.
// Optional ?mstart=&mend= filters leads by meeting date (the "Check Meetings" selector).
expressApp.get('/app/dashboard/:startDate/:endDate', async function (req, res) {
  const { startDate, endDate } = req.params;
  const { mstart, mend } = req.query;
  const meetingFilter = Boolean(mstart && mend);
  if (!validDates(startDate, endDate) || (meetingFilter && !validDates(mstart, mend))) {
    return sendError(res, 400, 'Dates must be YYYY-MM-DD');
  }
  try {
    const { data, zohoOutput, meta } = await loadDashboard({
      startDate,
      endDate,
      meetingStartDate: meetingFilter ? mstart : undefined,
      meetingEndDate: meetingFilter ? mend : undefined,
    });
    const meetings = meetingFilter
      ? countMeetings(zohoOutput, mstart, mend)
      : countMeetings(zohoOutput, startDate, endDate);
    res.set('Cache-Control', 'no-store');
    res.json({ ...data, ...meetings, meta });
  } catch (err) {
    handleFailure(res, err);
  }
});

// ---- Legacy endpoints (kept so the currently deployed widget keeps working) ----

expressApp.get('/app/leads/meetings/:startDate/:endDate', async function (req, res) {
  const { startDate, endDate } = req.params;
  if (!validDates(startDate, endDate)) return sendError(res, 400, 'Dates must be YYYY-MM-DD');
  try {
    const zoho = await getZohoOutput();
    res.json(countMeetings(zoho.value, startDate, endDate));
  } catch (err) {
    handleFailure(res, err);
  }
});

expressApp.get('/app/leads/:startDate/:endDate', async function (req, res) {
  const { startDate, endDate } = req.params;
  if (!validDates(startDate, endDate)) return sendError(res, 400, 'Dates must be YYYY-MM-DD');
  try {
    const { data, meta } = await loadDashboard({ startDate, endDate });
    res.json({ ...data, meta });
  } catch (err) {
    handleFailure(res, err);
  }
});

expressApp.get('/app/leads/meetingfilter/:startDate/:endDate/:mstartDate/:mendDate', async function (req, res) {
  const { startDate, endDate, mstartDate, mendDate } = req.params;
  if (!validDates(startDate, endDate, mstartDate, mendDate)) return sendError(res, 400, 'Dates must be YYYY-MM-DD');
  try {
    const { data, meta } = await loadDashboard({
      startDate,
      endDate,
      meetingStartDate: mstartDate,
      meetingEndDate: mendDate,
    });
    res.json({ ...data, meta });
  } catch (err) {
    handleFailure(res, err);
  }
});

// Pre-loads caches. Called by the scheduled warm-up (see lambda.js / serverless.yml).
expressApp.get('/app/warm', async function (req, res) {
  res.json(await warm());
});

module.exports = { expressApp, warm };

if (require.main === module) {
  expressApp.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on port ${port}`);
  });
}
