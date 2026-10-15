# AdsDashboardBackend

Backend for the BuildX Marketing Dashboard widget. It combines Zoho CRM leads (via a Deluge
function) with daily ad spend from Meta and Google Ads.

Live today: AWS API Gateway + Lambda, `https://2onghku7vk.execute-api.ap-south-1.amazonaws.com/dev`.

## Endpoints

| Route | Used by |
|---|---|
| `GET /app/dashboard/:start/:end[?mstart=&mend=]` | new widget: metrics + meeting counts + `meta` in one call |
| `GET /app/leads/:start/:end` | legacy widget (r43) |
| `GET /app/leads/meetingfilter/:start/:end/:mstart/:mend` | legacy widget |
| `GET /app/leads/meetings/:start/:end` | legacy widget |
| `GET /app/warm` | pre-loads caches |
| `GET /test` | health check |

Dates are `YYYY-MM-DD`. Every data response includes `meta.errors`. If Meta or Google fail,
the response says so there instead of silently reporting ₹0 spend.

## Why it is fast now

* The Zoho lead payload is cached for 10 min (`LEADS_TTL_MS`). If a refresh fails or is slow,
  a copy up to 6 h old is served and flagged (`meta.errors.leads`).
* Ad spend is cached **per day**. Days older than 3 days (`SPEND_FINAL_AFTER_DAYS`) are treated as final
  and never re-fetched. Recent days refresh every 10 min (`SPEND_TTL_MS`).
* Meta insights are pulled at `level=account` (one row per day, page size 500) instead of per ad.
  Google pulls only date/cost/clicks.
* A scheduled warm-up (every 5 min) keeps a Lambda container's caches populated.
* Upstream calls time out after 15–25 s, so the API answers before API Gateway's 29 s limit.

Caches live in Lambda memory, so a brand-new container pays one slow load. If that turns out
to matter, the next step is to move the per-day spend + leads into DynamoDB/S3.

## Environment variables

Required: `ZOHO_API`, `FACEBOOK_ACCESS_TOKEN`, `FACEBOOK_AD_ACCOUNT_ID`, `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_DEVELOPER_TOKEN`, `GOOGLE_CUSTOMER_TOKEN`.

Optional: `CORS_ORIGIN` (default `*`; set to the widget origin), `LEADS_TTL_MS`,
`LEADS_MAX_STALE_MS`, `SPEND_TTL_MS`, `SPEND_FINAL_AFTER_DAYS`, `ZOHO_TIMEOUT_MS`,
`FACEBOOK_TIMEOUT_MS`, `GOOGLE_TIMEOUT_MS`, `GOOGLE_SPEND_RESOURCE` (`ad_group_ad` default;
`customer` also counts Performance Max spend, but validate it first).

## Run / test

```bash
npm install
npm test          # unit tests (synthetic data)
npm start         # local server on :5000 (needs .env)
```

## Deploy to the existing Lambda (once AWS access is available)

1. In the Lambda console, note the current handler, runtime and env vars (back them up).
2. `npm ci --omit=dev`, then zip `index.js lambda.js facebook_Ads.js googleAds.js google_ads.js lib/ node_modules/ package.json`.
3. Upload the zip, set the handler to `lambda.handler`, memory to 1024 MB, timeout to 29 s.
4. Add an EventBridge rule `rate(5 minutes)` targeting the function with input `{"warm": true}`.
5. Check: `curl .../dev/test`, then `curl .../dev/app/dashboard/<today>/<today>`, and look at `meta.durationMs`.
   The old widget keeps working because the legacy routes are unchanged.

`serverless.yml` is an alternative for a fresh deployment, but it creates a **new** API URL.
