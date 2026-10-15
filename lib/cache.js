// Small in-memory cache for a warm Lambda container / long-running server.
//  - fresh entries (younger than ttlMs) are returned immediately
//  - concurrent callers share one in-flight load
//  - if a reload fails or takes longer than waitMs, a stale copy (younger than maxStaleMs)
//    is returned instead, flagged with stale: true, so the dashboard never hangs on it.

const entries = new Map();

function withTimeout(promise, ms) {
  if (!ms) return promise;
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * @returns {Promise<{value:any, fetchedAt:number, stale:boolean}>}
 */
async function cached(key, loader, { ttlMs, maxStaleMs = 0, waitMs = 0 }) {
  const entry = entries.get(key) || {};
  entries.set(key, entry);
  const now = Date.now();

  if (entry.value !== undefined && now - entry.fetchedAt < ttlMs) {
    return { value: entry.value, fetchedAt: entry.fetchedAt, stale: false };
  }

  if (!entry.inflight) {
    entry.inflight = Promise.resolve()
      .then(loader)
      .then((value) => {
        entry.value = value;
        entry.fetchedAt = Date.now();
        return value;
      })
      .finally(() => { entry.inflight = null; });
    // Avoid unhandled rejections when every caller fell back to the stale copy.
    entry.inflight.catch(() => {});
  }

  const hasUsableStale = entry.value !== undefined && now - entry.fetchedAt < maxStaleMs;
  try {
    const value = await withTimeout(entry.inflight, hasUsableStale ? waitMs : 0);
    return { value, fetchedAt: entry.fetchedAt, stale: false };
  } catch (err) {
    if (hasUsableStale) {
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
