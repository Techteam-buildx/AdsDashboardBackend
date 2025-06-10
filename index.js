/*
Copyright (c) 2017, ZOHO CORPORATION
License: MIT
*/
require('dotenv').config()
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
const perReferralCost = 50000;


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

expressApp.get('/test', (req, res) => {
  res.send("test ping received!")
})

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
    response = await axios.get(process.env.ZOHO_API);
  const start = new Date(req.params.startDate);
  const end = new Date(req.params.endDate);
  const output = JSON.parse(response.data.details.output);
  const google_meetings = output.google_meetings_data;
  const fb_meetings = output.facebook_meetings_data;
  const referral_meetings = output.referral_meetings_data;
  const cplead_meetings = output.cplead_meetings_data;

  let google_meeting = 0;
  let facebook_meeting = 0;
  let referral_meeting = 0;
  let cplead_meeting = 0;

  console.log("data in meetings api: ", google_meetings, fb_meetings,referral_meetings,cplead_meetings);

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

  if (Array.isArray(referral_meetings)) {
    referral_meetings.forEach(item => {
      const cur_date = new Date(item);
      if (start <= cur_date && end >= cur_date) {
        referral_meeting++;
      }
    });
  }

  if (Array.isArray(cplead_meetings)) {
    cplead_meetings.forEach(item => {
      const cur_date = new Date(item);
      if (start <= cur_date && end >= cur_date) {
        cplead_meeting++;
      }
    });
  }


  const respData = {
    google_meeting,
    facebook_meeting,
    referral_meeting,
    cplead_meeting
  }

  res.json(respData);

});

expressApp.get('/app/leads/:startDate/:endDate', async function (req, res) {
  const start = new Date(req.params.startDate);
  const end = new Date(req.params.endDate);

  let fbAds = [];
  try {
    fbAds = await getAdInsights(req.params.startDate, req.params.endDate);
  } catch (err) {
    console.log("Facebook Ads Error:", err);
  }

  response = await axios.get(process.env.ZOHO_API);
  const output = JSON.parse(response.data.details.output);
  
  const leads = output.leads_data;
  const dateMap = {};
  const fbDateMap = {};
  const referralDateMap = {};
  const cpleadDateMap = {};

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

  // Referral Counters
  let total_cost_referral = 0;
  let meetings_done_referral = 0;
  let qualified_referral = 0;
  let future_qualified_referral = 0;
  let leads_count_referral = 0;
  let converted_referral = 0;

  // CP Lead Counters
  let total_cost_cplead = 0;
  let meetings_done_cplead = 0;
  let qualified_cplead = 0;
  let future_qualified_cplead = 0;
  let leads_count_cplead = 0;
  let converted_cplead = 0;



  const googleAds = await fetchAds(req.params.startDate, req.params.endDate);

  for (let x of leads) {
    const lead_date = new Date(x.date);
    const dateStr = lead_date.toISOString().split('T')[0];
    if (start <= lead_date && end >= lead_date) {
      if (x.source === 'Google AdWords' ||  x.source === 'Direct Call' ) {
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
      else if (x.source === 'Referral Lead') {
        if (!referralDateMap[dateStr]) {
          referralDateMap[dateStr] = {
            budget: 0,
            meetings_done: 0,
            qualified: 0,
            future_qualified: 0,
            leads_count: 0,
            converted: 0,
            referral_clicks: 0
          }
        }
        if (x.mobile?.length > 9 && x.mobile?.length < 14) {
          referralDateMap[dateStr].leads_count++;
          leads_count_referral++;
        }
        if (x.iss === "Meeting Done") {
          referralDateMap[dateStr].meetings_done++;
          meetings_done_referral++;
        }
        if (x.qs === "Qualified") {
          referralDateMap[dateStr].qualified++;
          qualified_referral++;
        }
        if (x.qs === "Future Qualified") {
          referralDateMap[dateStr].future_qualified++;
          future_qualified_referral++;
        }
        if (x.converted === "Converted") {
          referralDateMap[dateStr].converted++;
          converted_referral++;
        }
        referralDateMap[dateStr].budget += perReferralCost;
        total_cost_referral += perReferralCost;
      }
      else if (x.source === 'CP Lead') {
        if (!cpleadDateMap[dateStr]) {
          cpleadDateMap[dateStr] = {
            budget: 0,
            meetings_done: 0,
            qualified: 0,
            future_qualified: 0,
            leads_count: 0,
            converted: 0,
            referral_clicks: 0
          }
        }
        if (x.mobile?.length > 9 && x.mobile?.length < 14) {
          cpleadDateMap[dateStr].leads_count++;
          leads_count_cplead++;
        }
        if (x.iss === "Meeting Done") {
          cpleadDateMap[dateStr].meetings_done++;
          meetings_done_cplead++;
        }
        if (x.qs === "Qualified") {
          cpleadDateMap[dateStr].qualified++;
          qualified_cplead++;
        }
        if (x.qs === "Future Qualified") {
          cpleadDateMap[dateStr].future_qualified++;
          future_qualified_cplead++;
        }
        if (x.converted === "Converted") {
          cpleadDateMap[dateStr].converted++;
          converted_cplead++;
        }
        let cost = x.cpbudget? Number(x.cpbudget)*0.025 : 0;
        cpleadDateMap[dateStr].budget += cost;
        total_cost_cplead += cost;
      }
    }
  }

  // Google Ads cost + clicks
  let c = 0, c1 = 0;
  for (let y of googleAds) {
    if (c == 0) {
      // console.log("c0: ", y);
      c = 1;
    }
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
    if (c1 == 0) {
      // console.log("c1: ", ad);
      c1 = 1;
    }
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

  // Referral data arrays
  const referral_budgetData = labels.map(date => referralDateMap[date]?.budget || 0);
  const referral_meetingsData = labels.map(date => referralDateMap[date]?.meetings_done || 0);
  const referral_qualifiedData = labels.map(date => referralDateMap[date]?.qualified || 0);
  const referral_leadsData = labels.map(date => referralDateMap[date]?.leads_count || 0);
  const referral_convertedData = labels.map(date => referralDateMap[date]?.converted || 0);

  // Cp Lead data arrays
  const cplead_budgetData = labels.map(date => cpleadDateMap[date]?.budget || 0);
  const cplead_meetingsData = labels.map(date => cpleadDateMap[date]?.meetings_done || 0);
  const cplead_qualifiedData = labels.map(date => cpleadDateMap[date]?.qualified || 0);
  const cplead_leadsData = labels.map(date => cpleadDateMap[date]?.leads_count || 0);
  const cplead_convertedData = labels.map(date => cpleadDateMap[date]?.converted || 0);

  // Calculated Metrics
  const cpl_google = leads_count_google ? total_cost_google / leads_count_google : 0;
  const cpm_google = meetings_done_google ? total_cost_google / meetings_done_google : 0;
  const lpq_google = qualified_google ? leads_count_google / qualified_google : 0;
  const lpc_google = converted_google ? total_cost_google / converted_google : 0;


  const cpl_facebook = leads_count_facebook ? total_cost_facebook / leads_count_facebook : 0;
  const cpm_facebook = meetings_done_facebook ? total_cost_facebook / meetings_done_facebook : 0;
  const lpq_facebook = qualified_facebook ? leads_count_facebook / qualified_facebook : 0;
  const lpc_facebook = converted_facebook ? total_cost_facebook / converted_facebook : 0;

  const cpl_referral = perReferralCost;
  const cpm_referral = meetings_done_referral ? total_cost_referral / meetings_done_referral : 0;
  const lpc_referral = converted_referral ? total_cost_referral / converted_referral : 0;

  const cpl_cplead = leads_count_cplead ? total_cost_cplead / leads_count_cplead : 0;
  const cpm_cplead = meetings_done_cplead ? total_cost_cplead / meetings_done_cplead : 0;
  const lpc_cplead = converted_cplead ? total_cost_cplead / converted_cplead : 0;




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
    facebook_convertedData,

    // Referral
    referral_budget: total_cost_referral,
    referral_leads: leads_count_referral,
    referral_qualified: qualified_referral,
    referral_future_qualified: future_qualified_referral,
    referral_converted: converted_referral,
    referral_meetings_done: meetings_done_referral,
    cpl_referral,
    cpm_referral,
    lpc_referral,
    referral_budgetData,
    referral_meetingsData,
    referral_qualifiedData,
    referral_leadsData,
    referral_convertedData,

    // cplead
    cplead_budget: total_cost_cplead,
    cplead_leads: leads_count_cplead,
    cplead_qualified: qualified_cplead,
    cplead_future_qualified: future_qualified_cplead,
    cplead_converted: converted_cplead,
    cplead_meetings_done: meetings_done_cplead,
    cpl_cplead,
    cpm_cplead,
    lpc_cplead,
    cplead_budgetData,
    cplead_meetingsData,
    cplead_qualifiedData,
    cplead_leadsData,
    cplead_convertedData
  };

  res.json(sendData);
});

expressApp.get('/app/leads/meetingfilter/:startDate/:endDate/:mstartDate/:mendDate', async function (req, res) {
  const start = new Date(req.params.startDate);
  const end = new Date(req.params.endDate);
  const mstart = new Date(req.params.mstartDate);
  const mend = new Date(req.params.mendDate);

  let fbAds = [];
  try {
    fbAds = await getAdInsights(req.params.startDate, req.params.endDate);
  } catch (err) {
    console.log("Facebook Ads Error:", err);
  }

  response = await axios.get(process.env.ZOHO_API);
  const output = JSON.parse(response.data.details.output);
  let leads = output.leads_data;
  leads = leads.filter((item)=>{
    if(item.meetingdate){
      const lead_meet_date = new Date(item.meetingdate);
      if(mstart <= lead_meet_date && mend >=lead_meet_date){
        return item;
      }
    }
  })

  const dateMap = {};
  const fbDateMap = {};
  const referralDateMap = {};
  const cpleadDateMap = {};

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

  // Referral Counters
  let total_cost_referral = 0;
  let meetings_done_referral = 0;
  let qualified_referral = 0;
  let future_qualified_referral = 0;
  let leads_count_referral = 0;
  let converted_referral = 0;

  // CP Lead Counters
  let total_cost_cplead = 0;
  let meetings_done_cplead = 0;
  let qualified_cplead = 0;
  let future_qualified_cplead = 0;
  let leads_count_cplead = 0;
  let converted_cplead = 0;



  const googleAds = await fetchAds(req.params.startDate, req.params.endDate);

  for (let x of leads) {
    const lead_date = new Date(x.date);
    const dateStr = lead_date.toISOString().split('T')[0];
    if (start <= lead_date && end >= lead_date) {
      if (x.source === 'Google AdWords' ||  x.source === 'Direct Call') {
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
      else if (x.source === 'Referral Lead') {
        if (!referralDateMap[dateStr]) {
          referralDateMap[dateStr] = {
            budget: 0,
            meetings_done: 0,
            qualified: 0,
            future_qualified: 0,
            leads_count: 0,
            converted: 0,
            referral_clicks: 0
          }
        }
        if (x.mobile?.length > 9 && x.mobile?.length < 14) {
          referralDateMap[dateStr].leads_count++;
          leads_count_referral++;
        }
        if (x.iss === "Meeting Done") {
          referralDateMap[dateStr].meetings_done++;
          meetings_done_referral++;
        }
        if (x.qs === "Qualified") {
          referralDateMap[dateStr].qualified++;
          qualified_referral++;
        }
        if (x.qs === "Future Qualified") {
          referralDateMap[dateStr].future_qualified++;
          future_qualified_referral++;
        }
        if (x.converted === "Converted") {
          referralDateMap[dateStr].converted++;
          converted_referral++;
        }
        referralDateMap[dateStr].budget += perReferralCost;
        total_cost_referral += perReferralCost;
      }
      else if (x.source === 'CP Lead') {
        if (!cpleadDateMap[dateStr]) {
          cpleadDateMap[dateStr] = {
            budget: 0,
            meetings_done: 0,
            qualified: 0,
            future_qualified: 0,
            leads_count: 0,
            converted: 0,
            referral_clicks: 0
          }
        }
        if (x.mobile?.length > 9 && x.mobile?.length < 14) {
          cpleadDateMap[dateStr].leads_count++;
          leads_count_cplead++;
        }
        if (x.iss === "Meeting Done") {
          cpleadDateMap[dateStr].meetings_done++;
          meetings_done_cplead++;
        }
        if (x.qs === "Qualified") {
          cpleadDateMap[dateStr].qualified++;
          qualified_cplead++;
        }
        if (x.qs === "Future Qualified") {
          cpleadDateMap[dateStr].future_qualified++;
          future_qualified_cplead++;
        }
        if (x.converted === "Converted") {
          cpleadDateMap[dateStr].converted++;
          converted_cplead++;
        }
        let cost = x.cpbudget? Number(x.cpbudget)*0.025 : 0;
        cpleadDateMap[dateStr].budget += cost;
        total_cost_cplead += cost;
      }
    }
  }

  // Google Ads cost + clicks
  let c = 0, c1 = 0;
  for (let y of googleAds) {
    if (c == 0) {
      // console.log("c0: ", y);
      c = 1;
    }
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
    if (c1 == 0) {
      // console.log("c1: ", ad);
      c1 = 1;
    }
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

  // Referral data arrays
  const referral_budgetData = labels.map(date => referralDateMap[date]?.budget || 0);
  const referral_meetingsData = labels.map(date => referralDateMap[date]?.meetings_done || 0);
  const referral_qualifiedData = labels.map(date => referralDateMap[date]?.qualified || 0);
  const referral_leadsData = labels.map(date => referralDateMap[date]?.leads_count || 0);
  const referral_convertedData = labels.map(date => referralDateMap[date]?.converted || 0);

  // Cp Lead data arrays
  const cplead_budgetData = labels.map(date => cpleadDateMap[date]?.budget || 0);
  const cplead_meetingsData = labels.map(date => cpleadDateMap[date]?.meetings_done || 0);
  const cplead_qualifiedData = labels.map(date => cpleadDateMap[date]?.qualified || 0);
  const cplead_leadsData = labels.map(date => cpleadDateMap[date]?.leads_count || 0);
  const cplead_convertedData = labels.map(date => cpleadDateMap[date]?.converted || 0);

  // Calculated Metrics
  const cpl_google = leads_count_google ? total_cost_google / leads_count_google : 0;
  const cpm_google = meetings_done_google ? total_cost_google / meetings_done_google : 0;
  const lpq_google = qualified_google ? leads_count_google / qualified_google : 0;
  const lpc_google = converted_google ? total_cost_google / converted_google : 0;


  const cpl_facebook = leads_count_facebook ? total_cost_facebook / leads_count_facebook : 0;
  const cpm_facebook = meetings_done_facebook ? total_cost_facebook / meetings_done_facebook : 0;
  const lpq_facebook = qualified_facebook ? leads_count_facebook / qualified_facebook : 0;
  const lpc_facebook = converted_facebook ? total_cost_facebook / converted_facebook : 0;

  const cpl_referral = perReferralCost;
  const cpm_referral = meetings_done_referral ? total_cost_referral / meetings_done_referral : 0;
  const lpc_referral = converted_referral ? total_cost_referral / converted_referral : 0;

  const cpl_cplead = leads_count_cplead ? total_cost_cplead / leads_count_cplead : 0;
  const cpm_cplead = meetings_done_cplead ? total_cost_cplead / meetings_done_cplead : 0;
  const lpc_cplead = converted_cplead ? total_cost_cplead / converted_cplead : 0;




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
    facebook_convertedData,

    // Referral
    referral_budget: total_cost_referral,
    referral_leads: leads_count_referral,
    referral_qualified: qualified_referral,
    referral_future_qualified: future_qualified_referral,
    referral_converted: converted_referral,
    referral_meetings_done: meetings_done_referral,
    cpl_referral,
    cpm_referral,
    lpc_referral,
    referral_budgetData,
    referral_meetingsData,
    referral_qualifiedData,
    referral_leadsData,
    referral_convertedData,

    // cplead
    cplead_budget: total_cost_cplead,
    cplead_leads: leads_count_cplead,
    cplead_qualified: qualified_cplead,
    cplead_future_qualified: future_qualified_cplead,
    cplead_converted: converted_cplead,
    cplead_meetings_done: meetings_done_cplead,
    cpl_cplead,
    cpm_cplead,
    lpc_cplead,
    cplead_budgetData,
    cplead_meetingsData,
    cplead_qualifiedData,
    cplead_leadsData,
    cplead_convertedData
  };

  res.json(sendData);
});



var options = {
  key: fs.readFileSync('./key.pem'),
  cert: fs.readFileSync('./cert.pem')
};

// https.createServer(options, expressApp).listen(port, function () {
//   console.log(chalk.green('Zet running at ht' + 'tps://127.0.0.1:' + port));
//   console.log(chalk.bold.cyan("Note: Please enable the host (https://127.0.0.1:" + port + ") in a new tab and authorize the connection by clicking Advanced->Proceed to 127.0.0.1 (unsafe)."));
// }).on('error', function (err) {
//   if (err.code === 'EADDRINUSE') {
//     console.log(chalk.bold.red(port + " port is already in use"));
//   }
// });

expressApp.listen(port, '0.0.0.0', () => {
  console.log(`Server listening on port ${port}`);
});
