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

// ─────────────────────────────────────────────────────────────────────────────
// Campaign rate-limiting helpers
// ─────────────────────────────────────────────────────────────────────────────

const CAMPAIGN_LOCK_KEY   = PREFIX + 'campaign:running';
const CAMPAIGN_TOKEN_KEY  = PREFIX + 'campaign:tokens';
const CAMPAIGN_SENT_PREFIX = PREFIX + 'campaign:sent:';

// Max tokens in the bucket (burst capacity).
// Meta allows ~80 template msgs/sec on standard tier, but 15/burst is safe.
const TOKEN_BUCKET_MAX    = 15;
// Refill rate: 1 token per second (= 1 msg/sec sustained).
const TOKEN_REFILL_RATE   = 1;   // tokens per second
const TOKEN_REFILL_MS     = 1000 / TOKEN_REFILL_RATE; // 1000ms

/**
 * Acquire the campaign-running lock.
 * Returns true if lock was acquired (you can proceed), false if another
 * send is already in progress.
 * TTL is 30 minutes — long enough for a 500-contact batch at 1/sec.
 */
async function acquireCampaignLock(ttlSeconds = 1800) {
  if (!client || !ready) return true; // Redis unavailable → allow (fallback)
  try {
    const result = await client.set(CAMPAIGN_LOCK_KEY, '1', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  } catch (e) {
    console.error('[redis] acquireCampaignLock', e.message);
    return true; // fail open
  }
}

/**
 * Release the campaign-running lock.
 */
async function releaseCampaignLock() {
  if (!client || !ready) return;
  try { await client.del(CAMPAIGN_LOCK_KEY); } catch { /* noop */ }
}

/**
 * Token-bucket rate limiter.
 * Consume one token. If the bucket is empty, wait until a token refills.
 *
 * Uses a single Redis key storing the current token count as a float string,
 * with the last-refill timestamp encoded alongside it: "<tokens>:<ts_ms>".
 * Falls back gracefully (no wait) if Redis is unavailable.
 */
async function consumeCampaignToken() {
  if (!client || !ready) {
    // Redis not available → fall back to a simple 1.2s sleep
    await new Promise((r) => setTimeout(r, 1200));
    return;
  }
  const MAX_WAIT_MS = 30000; // safety cap — never wait more than 30s
  const start = Date.now();

  while (true) {
    try {
      const raw = await client.get(CAMPAIGN_TOKEN_KEY);
      const now = Date.now();

      let tokens, lastTs;
      if (!raw) {
        tokens = TOKEN_BUCKET_MAX;
        lastTs  = now;
      } else {
        const [t, ts] = raw.split(':');
        tokens  = parseFloat(t);
        lastTs  = parseInt(ts, 10);
      }

      // Refill based on elapsed time
      const elapsed = now - lastTs;
      tokens = Math.min(TOKEN_BUCKET_MAX, tokens + (elapsed / TOKEN_REFILL_MS) * TOKEN_REFILL_RATE);

      if (tokens >= 1) {
        // Consume one token and save
        const newTokens = tokens - 1;
        await client.set(CAMPAIGN_TOKEN_KEY, `${newTokens}:${now}`, 'EX', 3600);
        return; // token consumed → proceed with the send
      }

      // Bucket empty — calculate how long until next token
      const waitMs = Math.ceil((1 - tokens) * TOKEN_REFILL_MS);
      if (Date.now() - start + waitMs > MAX_WAIT_MS) {
        console.warn('[redis] campaign token wait exceeded 30s, proceeding anyway');
        return;
      }
      await new Promise((r) => setTimeout(r, Math.min(waitMs, 500)));
    } catch (e) {
      console.error('[redis] consumeCampaignToken', e.message);
      await new Promise((r) => setTimeout(r, 1200)); // fallback pause
      return;
    }
  }
}

/**
 * Mark a wamid as "already sent" in Redis for 25 hours.
 * Used as a fast dedup check before creating a Message record.
 */
async function markCampaignSent(wamid) {
  if (!client || !ready || !wamid) return;
  try {
    await client.set(CAMPAIGN_SENT_PREFIX + wamid, '1', 'EX', 25 * 3600);
  } catch (e) { console.error('[redis] markCampaignSent', e.message); }
}

/**
 * Returns true if this wamid was already sent (Redis dedup check).
 * Falls back to false (allow) if Redis is unavailable — MongoDB check is the safety net.
 */
async function isCampaignSentDuplicate(wamid) {
  if (!client || !ready || !wamid) return false;
  try {
    const v = await client.get(CAMPAIGN_SENT_PREFIX + wamid);
    return v === '1';
  } catch { return false; }
}

module.exports = {
  init, nextSeq, get, set, del, isReady: () => ready,
  // Campaign rate-limit / dedup helpers
  acquireCampaignLock,
  releaseCampaignLock,
  consumeCampaignToken,
  markCampaignSent,
  isCampaignSentDuplicate,
};
