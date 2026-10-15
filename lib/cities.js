// City mapping for the City filter.
//  - Leads/meetings are assigned to a city by lead owner.
//  - Ad spend is assigned to a city by campaign name.
// Both can be overridden without a code change via CITY_OWNERS_JSON / CITY_CAMPAIGNS_JSON,
// e.g. CITY_OWNERS_JSON='{"Bangalore":["Sudipti","Naveen","Shreya"],"Hyderabad":["Madhuri"]}'

const DEFAULT_OWNERS = {
  Bangalore: ['Sudipti', 'Naveen', 'Shreya'],
  Hyderabad: ['Madhuri'],
  Hossur: [], // owner name still to be added
};

// Case-insensitive substrings looked for in the campaign name.
const DEFAULT_CAMPAIGNS = {
  Bangalore: ['bangalore', 'bengaluru', 'blr'],
  Hyderabad: ['hyderabad', 'hyd'],
  Hossur: ['hossur', 'hosur'],
};

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

/** City for an ad campaign, by keyword in its name. */
function cityForCampaign(campaign) {
  const name = norm(campaign);
  if (!name) return null;
  for (const [city, keywords] of Object.entries(CAMPAIGNS)) {
    if (keywords.some((k) => new RegExp(`(^|[^a-z])${norm(k)}([^a-z]|$)`).test(name))) return city;
  }
  return null;
}

function isCity(city) {
  return CITIES.includes(city);
}

module.exports = { CITIES, cityForOwner, cityForCampaign, isCity, ownerName };
