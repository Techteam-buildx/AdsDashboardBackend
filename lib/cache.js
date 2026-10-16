// Small in-memory cache for a warm Lambda container / long-running server.
//  - fresh entries (younger than ttlMs) are returned immediately
//  - concurrent callers share one in-flight load
//  - with refresh: false, a copy younger than maxStaleMs is returned without loading
//    (flagged stale once older than ttlMs); the scheduled warm-up does the refreshing
//  - if a load fails, a copy younger than maxStaleMs is returned, flagged stale
//
// On Lambda, a load must be awaited by the invocation that started it: once an invocation
// returns, the container is frozen and an unfinished request never completes. So no caller
// gives up on a load midway, and an in-flight load older than inflightTimeoutMs (left over
// from a frozen invocation) is replaced instead of reused.

const entries = new Map();

/**
 * @returns {Promise<{value:any, fetchedAt:number, stale:boolean}>}
 */
async function cached(key, loader, { ttlMs, maxStaleMs = 0, refresh = true, inflightTimeoutMs = 60000 }) {
  const entry = entries.get(key) || {};
  entries.set(key, entry);
  const now = Date.now();
  const age = entry.value !== undefined ? now - entry.fetchedAt : Infinity;

  if (age < ttlMs) {
    return { value: entry.value, fetchedAt: entry.fetchedAt, stale: false };
  }
  if (!refresh && age < maxStaleMs) {
    return { value: entry.value, fetchedAt: entry.fetchedAt, stale: true };
  }

  if (!entry.inflight || now - entry.inflightStartedAt > inflightTimeoutMs) {
    const load = Promise.resolve()
      .then(loader)
      .then((value) => {
        entry.value = value;
        entry.fetchedAt = Date.now();
        return value;
      })
      .finally(() => {
        if (entry.inflight === load) entry.inflight = null;
      });
    load.catch(() => {});
    entry.inflight = load;
    entry.inflightStartedAt = now;
  }

  try {
    const value = await entry.inflight;
    return { value, fetchedAt: entry.fetchedAt, stale: false };
  } catch (err) {
    if (entry.value !== undefined && Date.now() - entry.fetchedAt < maxStaleMs) {
      console.warn(`[cache] ${key}: serving stale copy (${err.message})`);
      return { value: entry.value, fetchedAt: entry.fetchedAt, stale: true };
    }
    throw err;
  }
}

function clearCache() {
  entries.clear();
}

module.exports = { cached, clearCache };
