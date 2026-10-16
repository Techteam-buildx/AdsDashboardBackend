const test = require('node:test');
const assert = require('node:assert');
const { cityForOwner, cityForCampaign } = require('../lib/cities');
const { buildLeadsResponse, countMeetings, spendByCity } = require('../lib/aggregate');

test('owners map to cities by first name, case-insensitively', () => {
  assert.strictEqual(cityForOwner('Sudipti Sharma'), 'Bangalore');
  assert.strictEqual(cityForOwner({ name: 'naveen K', id: '1' }), 'Bangalore');
  assert.strictEqual(cityForOwner('Madhuri'), 'Hyderabad');
  assert.strictEqual(cityForOwner('Someone Else'), null);
  assert.strictEqual(cityForOwner(null), null);
});

test('campaigns map to cities by keyword in the name', () => {
  assert.strictEqual(cityForCampaign('BLR | Search | 3BHK'), 'Bangalore');
  assert.strictEqual(cityForCampaign('Leads_Hyderabad_Oct'), 'Hyderabad');
  assert.strictEqual(cityForCampaign('Hosur villas'), 'Hossur');
  assert.strictEqual(cityForCampaign('Hyd_Search_Brand_PM'), 'Hyderabad');
  assert.strictEqual(cityForCampaign("Hosur_Lead_Gen_Statics_Sep'26"), 'Hossur');
  // untagged campaigns are Bangalore spend
  assert.strictEqual(cityForCampaign("Bizbucks_Lead_Gen_Infor Video Nov'25"), 'Bangalore');
  assert.strictEqual(cityForCampaign('Hydrangea project'), 'Bangalore'); // no partial-word match
});

const leads = [
  { date: '2026-10-01', source: 'Meta Ads', mobile: '9876543210', qs: 'Qualified', iss: 'Meeting Done', converted: 'Cold', owner: 'Sudipti S' },
  { date: '2026-10-01', source: 'Meta Ads', mobile: '9876543210', qs: 'Qualified', iss: 'First Call', converted: 'Cold', owner: 'Madhuri R' },
  { date: '2026-10-01', source: 'Google AdWords', mobile: '9876543210', qs: 'Not Valid', iss: 'First Call', converted: 'Cold', owner: 'Naveen' },
];
const facebookSpend = [
  { date: '2026-10-01', campaign: 'BLR Leads', cost: 1000, clicks: 10 },
  { date: '2026-10-01', campaign: 'HYD Leads', cost: 500, clicks: 5 },
  { date: '2026-10-01', campaign: 'Brand', cost: 100, clicks: 1 },
];
const googleSpend = [{ date: '2026-10-01', campaign: 'Bangalore Search', cost: 2000, clicks: 20 }];
const range = { startDate: '2026-10-01', endDate: '2026-10-01' };

test('GST is added to ad spend only', () => {
  const r = buildLeadsResponse({ leads, facebookSpend, googleSpend, ...range, gstRate: 0.18 });
  assert.strictEqual(Math.round(r.facebook_budget), 1888);
  assert.strictEqual(Math.round(r.google_budget), 2360);
  const none = buildLeadsResponse({ leads, facebookSpend, googleSpend, ...range });
  assert.strictEqual(none.facebook_budget, 1600);
});

test('city filter restricts both leads and spend', () => {
  const blr = buildLeadsResponse({ leads, facebookSpend, googleSpend, ...range, city: 'Bangalore' });
  assert.strictEqual(blr.facebook_leads, 1);
  assert.strictEqual(blr.google_leads, 1);
  assert.strictEqual(blr.facebook_budget, 1100); // includes the untagged "Brand" campaign
  assert.strictEqual(blr.google_budget, 2000);
  const hyd = buildLeadsResponse({ leads, facebookSpend, googleSpend, ...range, city: 'Hyderabad' });
  assert.strictEqual(hyd.facebook_leads, 1);
  assert.strictEqual(hyd.google_leads, 0);
  assert.strictEqual(hyd.facebook_budget, 500);
});

test('spendByCity reports unassigned campaigns separately', () => {
  assert.deepStrictEqual(
    spendByCity([...facebookSpend, ...googleSpend], '2026-10-01', '2026-10-01', 0),
    { Bangalore: 3100, Hyderabad: 500 }
  );
});

test('meetings can be filtered by city when items carry an owner', () => {
  const out = {
    google_meetings_data: [{ date: '2026-10-01', owner: 'Shreya' }, { date: '2026-10-01', owner: 'Madhuri' }],
    facebook_meetings_data: ['2026-10-01'],
  };
  assert.strictEqual(countMeetings(out, '2026-10-01', '2026-10-01').google_meeting, 2);
  assert.strictEqual(countMeetings(out, '2026-10-01', '2026-10-01').facebook_meeting, 1);
  assert.strictEqual(countMeetings(out, '2026-10-01', '2026-10-01', 'Bangalore').google_meeting, 1);
  assert.strictEqual(countMeetings(out, '2026-10-01', '2026-10-01', 'Bangalore').facebook_meeting, 0);
});
