const Redis = require('ioredis');

let client = null;
let ready = false;

const PREFIX = 'wati:';
const SEQ_KEY = PREFIX + 'seq:global';

function init() {
  if (client) return client;
  const host = process.env.REDIS_HOST;
  const port = Number(process.env.REDIS_PORT || 6379);
  const password = process.env.REDIS_PASSWORD || undefined;

  if (!host) {
    console.warn('[redis] REDIS_HOST not set - ordering via Redis disabled, falling back to createdAt only');
    return null;
  }

  client = new Redis({
    host,
    port,
    password,
    lazyConnect: false,
    enableReadyCheck: true,
    maxRetriesPerRequest: 3,
    retryStrategy(times) { return Math.min(times * 200, 2000); },
  });

  client.on('connect', () => console.log('[redis] connecting to', host + ':' + port));
  client.on('ready', async () => {
    ready = true;
    console.log('[redis] ready');
    if (String(process.env.REDIS_FLUSH_ON_STARTUP).toLowerCase() === 'true') {
      try {
        // Only delete cache keys, preserve nothing. Since this Redis is dedicated to the panel
        // we can flush everything on startup - old/stale entries cleared.
        await client.flushdb();
        console.log('[redis] flushed old cache (FLUSHDB)');
      } catch (e) { console.error('[redis] flush failed', e.message); }
    }
  });
  client.on('error', (e) => console.error('[redis] error', e.message));
  client.on('end', () => { ready = false; console.log('[redis] disconnected'); });

  return client;
}

// Atomic monotonic sequence used to tiebreak messages that share a Meta timestamp
// (Meta's timestamps have 1-second resolution; multiple rapid messages share the same).
async function nextSeq() {
  if (!client || !ready) return 0;
  try {
    return await client.incr(SEQ_KEY);
  } catch (e) {
    console.error('[redis] nextSeq failed', e.message);
    return 0;
  }
}

// Generic helpers (expose for future caching needs)
async function get(key) {
  if (!client || !ready) return null;
  try { return await client.get(PREFIX + key); } catch { return null; }
}
async function set(key, value, ttlSeconds) {
  if (!client || !ready) return;
  try {
    if (ttlSeconds) await client.set(PREFIX + key, value, 'EX', ttlSeconds);
    else await client.set(PREFIX + key, value);
  } catch (e) { console.error('[redis] set', e.message); }
}
async function del(key) {
  if (!client || !ready) return;
  try { await client.del(PREFIX + key); } catch { /* noop */ }
}

module.exports = { init, nextSeq, get, set, del, isReady: () => ready };
