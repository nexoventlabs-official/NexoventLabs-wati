/**
 * campaignScheduler.js
 * Polls every minute for:
 *   1. Contacts with lastStatus='scheduled' whose scheduledAt time has arrived.
 *   2. Contacts with lastStatus='rate_limited' whose retryAfter time has passed
 *      (auto-retry for 130429 account rate limit and 131049 per-user marketing cap).
 */

const CampaignContact = require('../models/CampaignContact');
const Contact = require('../models/Contact');
const Message = require('../models/Message');
const welcomeTemplate = require('./welcomeTemplateService');
const welcomeService = require('./welcomeService');
const { emit } = require('./socketService');
const redis = require('./redisService');

const POLL_INTERVAL_MS  = 60 * 1000;
const RESEND_GUARD_MS   = 23 * 60 * 60 * 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute the actual send for an array of CampaignContact documents.
 * - Skips contacts sent within the last 23 hours (double-send guard).
 * - Uses Redis token bucket to pace sends (1/sec sustained, 15 burst).
 * - Uses Redis dedup key (wamid) to prevent duplicate Message records.
 * - Handles 130429 (account rate limit) and 131049 (per-user marketing cap).
 */
async function executeSend(targets) {
  const tplName = await welcomeTemplate.getTemplateName();
  const welcome = await welcomeService.getWelcome();

  // Filter out already-sent contacts
  const now = Date.now();
  const eligible = targets.filter((t) => {
    if (!['sent', 'delivered', 'read'].includes(t.lastStatus)) return true;
    if (!t.lastSentAt) return true;
    return now - new Date(t.lastSentAt).getTime() > RESEND_GUARD_MS;
  });

  for (const t of eligible) {
    // Token bucket: wait for a send slot
    await redis.consumeCampaignToken();

    try {
      const resp = await welcomeTemplate.sendToContact(t.waId, t.name || '');
      const wamid = resp?.messages?.[0]?.id || '';

      t.lastStatus = 'sent';
      t.lastError = '';
      t.lastWamid = wamid;
      t.lastSentAt = new Date();
      t.scheduledAt = null;
      t.retryAfter = null;
      t.sendCount = (t.sendCount || 0) + 1;
      await t.save();
      emit('campaign:update', t);

      let contact = await Contact.findOne({ waId: t.waId });
      if (!contact) contact = await Contact.create({ waId: t.waId, name: t.name || '' });

      // Redis dedup: fast path, MongoDB check as fallback
      const alreadySent = await redis.isCampaignSentDuplicate(wamid);
      if (!alreadySent) {
        const existingMsg = wamid ? await Message.findOne({ wamid }).lean() : null;
        if (!existingMsg) {
          const seq = await redis.nextSeq();
          await Message.create({
            contact: contact._id,
            waId: t.waId,
            direction: 'outbound',
            wamid,
            type: 'template',
            templateName: tplName,
            templateData: {
              header: welcome.headerImage ? { type: 'IMAGE', mediaUrl: welcome.headerImage } : { type: 'NONE' },
              body: welcome.body,
              footer: welcome.footer,
              buttons: [{ type: 'QUICK_REPLY', text: welcome.cta || 'View Services' }],
            },
            text: `[welcome template] ${tplName}`,
            status: 'sent',
            seq,
          });
          contact.lastMessageAt = new Date();
          contact.lastMessagePreview = '[campaign] welcome';
          await contact.save();
        }
        await redis.markCampaignSent(wamid);
        emit('message:new', await Message.findOne({ wamid }).lean());
        emit('contact:upsert', contact);
      }
    } catch (e) {
      const err = e.response?.data?.error;
      const code = err?.code;

      // 130429 = account-level rate limit → back off 60s, retry in 1h
      if (code === 130429) {
        console.warn(`[campaignScheduler] Account rate limit (130429) at ${t.waId}. Backing off 60s…`);
        t.lastStatus = 'rate_limited';
        t.lastError = 'Account rate limit — auto-retry in 1 hour.';
        t.lastSentAt = new Date();
        t.retryAfter = new Date(Date.now() + 60 * 60 * 1000);
        t.scheduledAt = null;
        await t.save();
        emit('campaign:update', t);
        await sleep(60000);
        continue;
      }

      // 131049 = per-user marketing cap → retry after 24h
      if (code === 131049) {
        console.warn(`[campaignScheduler] Per-user cap (131049) for ${t.waId}. Auto-retry in 24h.`);
        t.lastStatus = 'rate_limited';
        t.lastError = 'Meta per-user marketing limit — auto-retry in 24 hours.';
        t.lastSentAt = new Date();
        t.retryAfter = new Date(Date.now() + 24 * 60 * 60 * 1000);
        t.scheduledAt = null;
        await t.save();
        emit('campaign:update', t);
        continue;
      }

      const notWa =
        code === 131026 || code === 131056 ||
        /not.*whatsapp|invalid.*recipient|recipient.*not.*reachable|blocked/i.test(err?.message || '');
      t.lastStatus = notWa ? 'not_whatsapp' : 'failed';
      t.lastError = err?.error_user_msg || err?.message || e.message;
      t.lastSentAt = new Date();
      t.scheduledAt = null;
      t.retryAfter = null;
      await t.save();
      emit('campaign:update', t);
      console.warn(`[campaignScheduler] ${t.waId} -> ${t.lastStatus}: ${t.lastError}`);
    }
  }
}

/**
 * Check for due scheduled/rate-limited contacts and fire them.
 * Skipped entirely if a manual send is already holding the campaign lock.
 */
async function tick() {
  try {
    const now = new Date();

    // 1. Scheduled contacts whose time has arrived.
    const scheduled = await CampaignContact.find({
      lastStatus: 'scheduled',
      scheduledAt: { $lte: now },
    });

    // 2. Rate-limited contacts ready for retry.
    const retryDue = await CampaignContact.find({
      lastStatus: 'rate_limited',
      retryAfter: { $lte: now },
    });

    const due = [...scheduled, ...retryDue];
    if (!due.length) return;

    console.log(`[campaignScheduler] ${scheduled.length} scheduled + ${retryDue.length} rate-limit retries to process…`);

    // Try to acquire the campaign lock. If a manual send is running, skip this
    // tick — we'll pick up on the next minute poll instead.
    const lockAcquired = await redis.acquireCampaignLock();
    if (!lockAcquired) {
      console.log('[campaignScheduler] Campaign lock held by manual send — skipping tick, will retry next minute.');
      return;
    }

    try {
      // Verify template is still approved before sending.
      let status;
      try {
        ({ status } = await welcomeTemplate.refresh());
      } catch {
        ({ status } = await welcomeTemplate.getStatus());
      }

      if (status !== 'APPROVED') {
        console.warn(`[campaignScheduler] Template status is ${status}. Aborting.`);
        for (const t of due) {
          t.lastStatus = 'failed';
          t.lastError = `Template not APPROVED (${status}) at send time.`;
          t.scheduledAt = null;
          t.retryAfter = null;
          await t.save();
          emit('campaign:update', t);
        }
        return;
      }

      await executeSend(due);
    } finally {
      await redis.releaseCampaignLock();
    }
  } catch (e) {
    console.error('[campaignScheduler] tick error:', e.message);
  }
}

/**
 * Start the polling loop. Call once from server.js after DB connection.
 */
function start() {
  console.log('[campaignScheduler] Started — polling every 60s for scheduled sends.');
  // Run once immediately, then on interval.
  tick();
  setInterval(tick, POLL_INTERVAL_MS);
}

module.exports = { start, executeSend };
