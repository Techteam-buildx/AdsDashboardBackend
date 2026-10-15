const test = require('node:test');
const assert = require('node:assert');
const { cached, clearCache } = require('../lib/cache');

test('cache: concurrent callers share one load, fresh hits skip the loader', async () => {
  clearCache();
  let calls = 0;
  const loader = async () => { calls++; await new Promise((r) => setTimeout(r, 20)); return 'v'; };
  const [a, b] = await Promise.all([
    cached('k', loader, { ttlMs: 1000 }),
    cached('k', loader, { ttlMs: 1000 }),
  ]);
  assert.strictEqual(a.value, 'v');
  assert.strictEqual(b.value, 'v');
  await cached('k', loader, { ttlMs: 1000 });
  assert.strictEqual(calls, 1);
});

test('cache: serves a flagged stale copy when reload fails', async () => {
  clearCache();
  await cached('s', async () => 'old', { ttlMs: 1000 });
  const r = await cached('s', async () => { throw new Error('boom'); }, { ttlMs: 0, maxStaleMs: 60000 });
  assert.deepStrictEqual([r.value, r.stale], ['old', true]);
});

test('cache: serves stale copy when reload is slower than waitMs', async () => {
  clearCache();
  await cached('w', async () => 'old', { ttlMs: 1000 });
  const slow = () => new Promise((r) => setTimeout(() => r('new'), 200));
  const r = await cached('w', slow, { ttlMs: 0, maxStaleMs: 60000, waitMs: 20 });
  assert.deepStrictEqual([r.value, r.stale], ['old', true]);
});

test('cache: with no stale copy, a failed load is an error', async () => {
  clearCache();
  await assert.rejects(cached('e', async () => { throw new Error('down'); }, { ttlMs: 1000 }), /down/);
});

test('getSpend: only fetches missing days and reports failures', async () => {
  const fb = require('../facebook_Ads');
  const google = require('../googleAds');
  const calls = [];
  fb.getDailySpend = async (s, e) => { calls.push([s, e]); return [{ date: '2025-01-02', campaign: 'BLR Leads', cost: 10, clicks: 1 }]; };
  google.getDailySpend = async () => { throw new Error('Google Ads: quota'); };
  delete require.cache[require.resolve('../lib/data')];
  const { getSpend } = require('../lib/data');

  const first = await getSpend('facebook', '2025-01-01', '2025-01-03');
  assert.deepStrictEqual(first.rows, [{ date: '2025-01-02', campaign: 'BLR Leads', cost: 10, clicks: 1 }]);
  assert.strictEqual(first.error, null);

  await getSpend('facebook', '2025-01-02', '2025-01-03'); // all old days cached
  await getSpend('facebook', '2025-01-02', '2025-01-05'); // only 04..05 missing
  assert.deepStrictEqual(calls, [['2025-01-01', '2025-01-03'], ['2025-01-04', '2025-01-05']]);

  const g = await getSpend('google', '2025-01-01', '2025-01-03');
  assert.match(g.error, /quota.*3 of 3 days missing/);
});
