/*
Copyright (c) 2017, ZOHO CORPORATION
License: MIT
*/
require('dotenv').config();
var fs = require('fs');
var path = require('path');
var express = require('express');
var bodyParser = require('body-parser');
var errorHandler = require('errorhandler');
var morgan = require('morgan');
var serveIndex = require('serve-index');
var https = require('https');
var chalk = require('chalk');
var axios = require('axios');
const { send } = require('process');
const { fetchAds } = require('./googleAds');
const { getAdInsights } = require('./facebook_Ads');

process.env.PWD = process.env.PWD || process.cwd();


var expressApp = express();
var port = process.env.PORT || 5000;

expressApp.set('port', port);
expressApp.use(morgan('dev'));
expressApp.use(bodyParser.json());
expressApp.use(bodyParser.urlencoded({ extended: false }));
expressApp.use(errorHandler());


expressApp.use('/', function (req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

expressApp.get('/plugin-manifest.json', function (req, res) {
  res.sendfile('plugin-manifest.json');
});

expressApp.use('/app', express.static('app'));
expressApp.use('/app', serveIndex('app'));


expressApp.get('/', function (req, res) {
  res.redirect('/app');
});

function getAllDatesInRange(start, end) {
  const dates = [];
  const current = new Date(start);
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

// expressApp.get('/app/fresh', async (req, res) => {
//   const data = await axios.get('https://buildx-org.myfreshworks.com/crm/sales/');
//   console.log("data from fresherworks: ", data);
// })
let response;
expressApp.get('/app/leads/meetings/:startDate/:endDate', async function (req, res) {
  console.log('meetings date: ', req.params);
  if (!response)
    response = await axios.get('https://www.zohoapis.in/crm/v7/functions/getdata/actions/execute?auth_type=apikey&zapikey=1003.d54f68d40970d21ec80e8106b205b246.02bd5138f491e2860d5ffeabd4b09dc9');
  const start = new Date(req.params.startDate);
  const end = new Date(req.params.endDate);
  const output = JSON.parse(response.data.details.output);
  const google_meetings = output.google_meetings_data;
  const fb_meetings = output.facebook_meetings_data;

  let google_meeting = 0;
  let facebook_meeting = 0;

  console.log("data in meetings api: ", google_meetings, fb_meetings);

  // Meetings Data
  if (Array.isArray(google_meetings)) {
    google_meetings.forEach(item => {
      const cur_date = new Date(item);
      if (start <= cur_date && end >= cur_date) {
        google_meeting++;
      }
    });
  }

  if (Array.isArray(fb_meetings)) {
    for (let x of fb_meetings) {
      const cur_date = new Date(x);
      if (start <= cur_date && end >= cur_date) {
        facebook_meeting++;
      }
    }
  }


  const respData = {
    google_meeting,
    facebook_meeting
  }

  res.json(respData);

});

expressApp.get('/test', (req, res) => {
  res.send("test ping received!")
})

expressApp.get('/app/leads/:startDate/:endDate', async function (req, res) {

  const start = new Date(req.params.startDate);
  const end = new Date(req.params.endDate);

  let fbAds = [];
  try {
    fbAds = await getAdInsights(req.params.startDate, req.params.endDate);
  } catch (err) {
    console.log("Facebook Ads Error:", err);
  }

  response = await axios.get('https://www.zohoapis.in/crm/v7/functions/getdata/actions/execute?auth_type=apikey&zapikey=1003.d54f68d40970d21ec80e8106b205b246.02bd5138f491e2860d5ffeabd4b09dc9');
  const output = JSON.parse(response.data.details.output);
  const leads = output.leads_data;

  const dateMap = {};
  const fbDateMap = {};

  // Google Counters
  let total_cost_google = 0;
  let google_clicks = 0;
  let meetings_done_google = 0;
  let qualified_google = 0;
  let future_qualified_google = 0;
  let leads_count_google = 0;
  let converted_google = 0;


  // Facebook Counters
  let total_cost_facebook = 0;
  let facebook_clicks = 0;
  let meetings_done_facebook = 0;
  let qualified_facebook = 0;
  let future_qualified_facebook = 0;
  let leads_count_facebook = 0;
  let converted_facebook = 0;



  const googleAds = await fetchAds(req.params.startDate, req.params.endDate);

  for (let x of leads) {
    const lead_date = new Date(x.date);
    const dateStr = lead_date.toISOString().split('T')[0];
    if (start <= lead_date && end >= lead_date) {
      if (x.source === 'Google AdWords' || !x.source) {
        if (!dateMap[dateStr]) {
          dateMap[dateStr] = {
            budget: 0,
            meetings_done: 0,
            qualified: 0,
            future_qualified: 0,
            leads_count: 0,
            converted: 0,
            google_clicks: 0
          };
        }
        if (x.mobile?.length > 9 && x.mobile?.length < 14) {
          dateMap[dateStr].leads_count++;
          leads_count_google++;
        }
        if (x.iss === "Meeting Done") {
          dateMap[dateStr].meetings_done++;
          meetings_done_google++;
        }
        if (x.qs === "Qualified") {
          dateMap[dateStr].qualified++;
          qualified_google++;
        }
        if (x.qs === "Future Qualified") {
          dateMap[dateStr].future_qualified++;
          future_qualified_google++;
        }
        if (x.converted === "Converted") {
          dateMap[dateStr].converted++;
          converted_google++;
        }
      } else if (x.source === 'Meta Ads') {
        if (!fbDateMap[dateStr]) {
          fbDateMap[dateStr] = {
            budget: 0,
            meetings_done: 0,
            qualified: 0,
            future_qualified: 0,
            leads_count: 0,
            converted: 0,
            facebook_clicks: 0
          };
        }
        if (x.mobile?.length > 9 && x.mobile?.length < 14) {
          fbDateMap[dateStr].leads_count++;
          leads_count_facebook++;
        }
        if (x.iss === "Meeting Done") {
          fbDateMap[dateStr].meetings_done++;
          meetings_done_facebook++;
        }
        if (x.qs === "Qualified") {
          fbDateMap[dateStr].qualified++;
          qualified_facebook++;
        }
        if (x.qs === "Future Qualified") {
          fbDateMap[dateStr].future_qualified++;
          future_qualified_facebook++;
        }
        if (x.converted === "Converted") {
          fbDateMap[dateStr].converted++;
          converted_facebook++;
        }
      }
    }
  }

  // Google Ads cost + clicks
  for (let y of googleAds) {
    const ad_date = new Date(y.segments.date);
    const dateStr = ad_date.toISOString().split('T')[0];
    if (start <= ad_date && end >= ad_date) {
      if (!dateMap[dateStr]) {
        dateMap[dateStr] = {
          budget: 0,
          meetings_done: 0,
          qualified: 0,
          future_qualified: 0,
          leads_count: 0,
          converted: 0,
          google_clicks: 0
        };
      }
      const cost = (1.0 * y.metrics.costMicros) / 1000000;
      if (cost != null) {
        dateMap[dateStr].budget += cost;
        total_cost_google += cost;
      }
      if (y.metrics.clicks) {
        google_clicks += y.metrics.clicks;
        dateMap[dateStr].google_clicks += y.metrics.clicks;
      }
    }
  }

  // Facebook Ads cost + clicks
  for (let ad of fbAds) {
    const adDate = new Date(ad.date_start);
    const dateStr = adDate.toISOString().split('T')[0];
    if (start <= adDate && end >= adDate) {
      if (!fbDateMap[dateStr]) {
        fbDateMap[dateStr] = {
          budget: 0,
          meetings_done: 0,
          qualified: 0,
          future_qualified: 0,
          leads_count: 0,
          converted: 0,
          facebook_clicks: 0
        };
      }
      const fbCost = parseFloat(ad.spend || "0");
      const fbClicks = parseInt(ad.clicks || "0");
      fbDateMap[dateStr].budget += fbCost;
      fbDateMap[dateStr].facebook_clicks += fbClicks;
      total_cost_facebook += fbCost;
      facebook_clicks += fbClicks;
    }
  }

  const labels = getAllDatesInRange(start, end);

  // Google data arrays
  const google_budgetData = labels.map(date => dateMap[date]?.budget || 0);
  const google_meetingsData = labels.map(date => dateMap[date]?.meetings_done || 0);
  const google_qualifiedData = labels.map(date => dateMap[date]?.qualified || 0);
  const google_leadsData = labels.map(date => dateMap[date]?.leads_count || 0);
  const google_convertedData = labels.map(date => dateMap[date]?.converted || 0);

  // Facebook data arrays
  const facebook_budgetData = labels.map(date => fbDateMap[date]?.budget || 0);
  const facebook_meetingsData = labels.map(date => fbDateMap[date]?.meetings_done || 0);
  const facebook_qualifiedData = labels.map(date => fbDateMap[date]?.qualified || 0);
  const facebook_leadsData = labels.map(date => fbDateMap[date]?.leads_count || 0);
  const facebook_convertedData = labels.map(date => fbDateMap[date]?.converted || 0);

  // Calculated Metrics
  const cpl_google = leads_count_google ? total_cost_google / leads_count_google : 0;
  const cpm_google = meetings_done_google ? total_cost_google / meetings_done_google : 0;
  const lpq_google = qualified_google ? leads_count_google / qualified_google : 0;
  const lpc_google = converted_google ? total_cost_google / converted_google : 0;


  const cpl_facebook = leads_count_facebook ? total_cost_facebook / leads_count_facebook : 0;
  const cpm_facebook = meetings_done_facebook ? total_cost_facebook / meetings_done_facebook : 0;
  const lpq_facebook = qualified_facebook ? leads_count_facebook / qualified_facebook : 0;
  const lpc_facebook = converted_facebook ? total_cost_facebook / converted_facebook : 0;

  // Send final response
  const sendData = {
    labels,
    google_budget: total_cost_google,
    google_clicks,
    google_leads: leads_count_google,
    google_qualified: qualified_google,
    google_future_qualified: future_qualified_google,
    google_converted: converted_google,
    google_meetings_done: meetings_done_google,
    cpl_google,
    cpm_google,
    lpq_google,
    lpc_google,
    google_budgetData,
    google_meetingsData,
    google_qualifiedData,
    google_leadsData,
    google_convertedData,

    // Facebook
    facebook_budget: total_cost_facebook,
    facebook_clicks,
    facebook_leads: leads_count_facebook,
    facebook_qualified: qualified_facebook,
    facebook_future_qualified: future_qualified_facebook,
    facebook_converted: converted_facebook,
    facebook_meetings_done: meetings_done_facebook,
    cpl_facebook,
    cpm_facebook,
    lpq_facebook,
    lpc_facebook,
    facebook_budgetData,
    facebook_meetingsData,
    facebook_qualifiedData,
    facebook_leadsData,
    facebook_convertedData
  };

  res.json(sendData);
});

var options = {
  key: fs.readFileSync('./key.pem'),
  cert: fs.readFileSync('./cert.pem')
};

expressApp.listen(port, () => {
  console.log('running on port: ', port)
});
