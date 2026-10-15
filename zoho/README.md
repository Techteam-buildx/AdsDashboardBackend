# Zoho function `getData` (source of `ZOHO_API`)

Zoho CRM → Setup → Developer Hub → Functions → **getData** (REST API via API key is enabled).
`getData1` is an older copy with the API key disabled.

## Change needed for the City filter

The backend matches cities on the lead owner. Two additions to the function's output:

1. **Every item in `leads_data` gets an `owner` field** with the lead owner's name:

   ```deluge
   // where each lead row map is built
   row.put("owner", ifnull(lead.get("Owner"), {}).get("name"));
   ```

2. **Meeting lists carry the owner too.** Change each item in `google_meetings_data`, `facebook_meetings_data`,
   `socials_meetings_data`, `referral_meetings_data` and `cplead_meetings_data` from a plain date string to:

   ```deluge
   m = Map();
   m.put("date", meetingDate);   // same value that is added today
   m.put("owner", ifnull(lead.get("Owner"), {}).get("name"));
   google_meetings_data.add(m);  // likewise for the other lists
   ```

The backend accepts both the old and new formats, so this can be deployed before or after the backend.
Until it's done, the City filter splits spend by campaign but warns that leads/meetings are not split.

## Owner → city mapping

Default mapping is in `lib/cities.js`; override without a code change via the `CITY_OWNERS_JSON` env var:

```json
{"Bangalore":["Sudipti","Naveen","Shreya"],"Hyderabad":["Madhuri"],"Hossur":["<owner first name>"]}
```

Campaign → city uses keywords in the campaign name (`CITY_CAMPAIGNS_JSON`). `meta.spendByCity` in every
`/app/dashboard` response shows spend per city plus `Unassigned`, which is useful for checking the keywords.
