// City mapping for the City filter.
//  - Leads/meetings are assigned to a city by lead owner.
//  - Ad spend is assigned to a city by campaign name.
// Both can be overridden without a code change via CITY_OWNERS_JSON / CITY_CAMPAIGNS_JSON,
// e.g. CITY_OWNERS_JSON='{"Bangalore":["Sudipti","Naveen","Shreya"],"Hyderabad":["Madhuri"]}'

// Matched on the owner's full name or first name, case-insensitively. Names as they
// appear in Zoho: "shreya shreya", "naveen naveen", "sudeepthi sudeepthi", "Madhuri Nara",
// "Hosur IS". Owners not listed (e.g. admins) count only under All Cities.
const DEFAULT_OWNERS = {
  Bangalore: ['Sudipti', 'Sudeepthi', 'Naveen', 'Shreya'],
  Hyderabad: ['Madhuri'],
  Hossur: ['Hosur IS', 'Hosur'],
};

// Case-insensitive words looked for in the campaign name. Campaigns that match no city
// (e.g. "Bizbucks_Lead_Gen_...", "Boost Instagram") belong to DEFAULT_SPEND_CITY: checked
// against the client's monthly sheets, untagged spend is Bangalore spend.
const DEFAULT_CAMPAIGNS = {
  Hyderabad: ['hyderabad', 'hyd'],
  Hossur: ['hossur', 'hosur'],
  Bangalore: ['bangalore', 'bengaluru', 'blr'],
};
const DEFAULT_SPEND_CITY = process.env.DEFAULT_SPEND_CITY || 'Bangalore';

// Leads owned by these users are web-form leads; the client attributes them to the
// sales owner shown in the lead's "Created By" field instead (confirmed 21 Oct 2026).
const CREATED_BY_OWNERS = fromEnv('CREATED_BY_OWNERS_JSON', ['Pankaj']);

function fromEnv(name, fallback) {
  if (!process.env[name]) return fallback;
  try {
    return JSON.parse(process.env[name]);
  } catch (err) {
    console.error(`Invalid ${name}, using defaults: ${err.message}`);
    return fallback;
  }
}

const OWNERS = fromEnv('CITY_OWNERS_JSON', DEFAULT_OWNERS);
const CAMPAIGNS = fromEnv('CITY_CAMPAIGNS_JSON', DEFAULT_CAMPAIGNS);
const CITIES = Object.keys(OWNERS);

const norm = (s) => String(s || '').trim().toLowerCase();

// Owner may be a name string or a Zoho lookup object ({name, id, email}).
function ownerName(owner) {
  if (owner && typeof owner === 'object') return owner.name || '';
  return owner || '';
}

/** City for a lead owner, matched on the owner's first name (or full name). */
function cityForOwner(owner) {
  const name = norm(ownerName(owner));
  if (!name) return null;
  const first = name.split(/\s+/)[0];
  for (const [city, owners] of Object.entries(OWNERS)) {
    if (owners.some((o) => norm(o) === name || norm(o) === first)) return city;
  }
  return null;
}

/** City for an ad campaign, by keyword in its name; untagged campaigns go to DEFAULT_SPEND_CITY. */
function cityForCampaign(campaign) {
  const name = norm(campaign);
  for (const [city, keywords] of Object.entries(CAMPAIGNS)) {
    if (keywords.some((k) => new RegExp(`(^|[^a-z])${norm(k)}([^a-z]|$)`).test(name))) return city;
  }
  return DEFAULT_SPEND_CITY || null;
}

/**
 * City for a lead: by lead owner, except for leads owned by CREATED_BY_OWNERS (e.g. Pankaj),
 * which are attributed to the "Created By" user.
 */
function cityForLead(owner, createdBy) {
  const name = norm(ownerName(owner));
  const first = name.split(/\s+/)[0];
  const viaCreatedBy = CREATED_BY_OWNERS.some((o) => norm(o) === name || norm(o) === first);
  return cityForOwner(viaCreatedBy ? createdBy : owner);
}

function isCity(city) {
  return CITIES.includes(city);
}

module.exports = { CITIES, cityForOwner, cityForLead, cityForCampaign, isCity, ownerName };
