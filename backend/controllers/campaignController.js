const CampaignContact = require('../models/CampaignContact');
const Contact = require('../models/Contact');
const Message = require('../models/Message');
const welcomeTemplate = require('../services/welcomeTemplateService');
const meta = require('../services/metaService');
const welcomeService = require('../services/welcomeService');
const { emit } = require('../services/socketService');
const redis = require('../services/redisService');
const metaErrors = require('../utils/metaErrors');

// Normalize any input to E.164-without-plus digits.
function normWa(v) {
  return String(v || '').replace(/\D/g, '');
}

// Pause execution for `ms` milliseconds — used for rate-limit spacing.
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

exports.list = async (_req, res) => {
  const items = await CampaignContact.find().sort({ createdAt: -1 }).lean();
  res.json(items);
};

// Add one or many numbers. Body: { numbers: "csv or newline", name? } OR { waId, name }.
// Duplicates (already in the list) are skipped, not errored.
exports.add = async (req, res) => {
  try {
    const b = req.body || {};
    let entries = [];
    if (Array.isArray(b.contacts)) {
      entries = b.contacts.map((c) => ({ waId: normWa(c.waId || c.number), name: c.name || '' }));
    } else if (b.numbers) {
      // Split on comma / newline / semicolon.
      entries = String(b.numbers)
        .split(/[\n,;]+/)
        .map((s) => ({ waId: normWa(s), name: b.name || '' }));
    } else if (b.waId || b.number) {
      entries = [{ waId: normWa(b.waId || b.number), name: b.name || '' }];
    }

    // Keep only valid-looking numbers (>= 8 digits) and dedupe within the batch.
    const seen = new Set();
    entries = entries.filter((e) => {
      if (!e.waId || e.waId.length < 8) return false;
      if (seen.has(e.waId)) return false;
      seen.add(e.waId);
      return true;
    });
    if (!entries.length) return res.status(400).json({ error: 'No valid numbers provided.' });

    const added = [];
    const duplicates = [];
    for (const e of entries) {
      const existing = await CampaignContact.findOne({ waId: e.waId });
      if (existing) {
        duplicates.push(e.waId);
        // Update the name if a new one was given and the slot was empty.
        if (e.name && !existing.name) { existing.name = e.name; await existing.save(); }
        continue;
      }
      const doc = await CampaignContact.create({ waId: e.waId, name: e.name, lastStatus: 'queued' });
      added.push(doc);
      emit('campaign:update', doc);
    }
    res.json({ ok: true, added: added.length, duplicates: duplicates.length, items: added });
  } catch (e) {
    console.error('[campaign.add]', e.message);
    res.status(500).json({ error: 'Failed', details: e.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const doc = await CampaignContact.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    await doc.deleteOne();
    emit('campaign:delete', { id: req.params.id });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed', details: e.message });
  }
};

// Bulk delete. Body: { ids: [...] }  (empty/omitted = delete all).
exports.removeMany = async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : null;
    const filter = ids && ids.length ? { _id: { $in: ids } } : {};
    const docs = await CampaignContact.find(filter).select('_id').lean();
    const delIds = docs.map((d) => String(d._id));
    if (!delIds.length) return res.json({ ok: true, deleted: 0 });
    await CampaignContact.deleteMany({ _id: { $in: delIds } });
    for (const id of delIds) emit('campaign:delete', { id });
    res.json({ ok: true, deleted: delIds.length });
  } catch (e) {
    res.status(500).json({ error: 'Failed', details: e.message });
  }
};

// Send the welcome template to selected campaign contacts immediately.
// Body: { ids: [campaignContactId, ...] }  (omit/empty = all)
exports.send = async (req, res) => {
  try {
    // Pull the live status from Meta first.
    let status;
    try {
      ({ status } = await welcomeTemplate.refresh());
    } catch {
      ({ status } = await welcomeTemplate.getStatus());
    }
    if (status !== 'APPROVED') {
      return res.status(400).json({
        error: `Welcome template is ${status}. It must be APPROVED by Meta before you can run a campaign.`,
      });
    }

    // ── Campaign lock: prevent two simultaneous sends ──────────────────────
    const lockAcquired = await redis.acquireCampaignLock();
    if (!lockAcquired) {
      return res.status(429).json({
        error: 'A campaign send is already in progress. Please wait for it to finish before starting another.',
      });
    }

    try {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids : null;
      const filter = ids && ids.length ? { _id: { $in: ids } } : {};
      const targets = await CampaignContact.find(filter);
      if (!targets.length) return res.status(400).json({ error: 'No contacts selected.' });

      // Guard: skip contacts already sent/delivered/read within 23h, or
      // rate_limited contacts still within their retryAfter window.
      const RESEND_GUARD_MS = 23 * 60 * 60 * 1000;
      const now = Date.now();

      const eligibleTargets = targets.filter((t) => {
        if (['sent', 'delivered', 'read'].includes(t.lastStatus)) {
          if (!t.lastSentAt) return true;
          return now - new Date(t.lastSentAt).getTime() > RESEND_GUARD_MS;
        }
        if (t.lastStatus === 'rate_limited') {
          // Still within retryAfter window → skip (scheduler will handle it)
          if (t.retryAfter && new Date(t.retryAfter).getTime() > now) return false;
          return true;
        }
        return true;
      });

      const skipped = targets.length - eligibleTargets.length;
      if (!eligibleTargets.length) {
        return res.status(400).json({
          error: `All selected contacts were either sent to recently or are waiting for Meta's rate-limit window to reset.`,
        });
      }

      const tplName = await welcomeTemplate.getTemplateName();
      const welcome = await welcomeService.getWelcome();

      let sent = 0, failed = 0, rateLimited = 0;
      const total = eligibleTargets.length;

      for (const t of eligibleTargets) {
        // ── Token bucket: wait for a send slot before calling Meta ──────────
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
          sent += 1;

          let contact = await Contact.findOne({ waId: t.waId });
          if (!contact) contact = await Contact.create({ waId: t.waId, name: t.name || '' });

          // ── Redis dedup: fast check before touching MongoDB ────────────────
          const alreadySent = await redis.isCampaignSentDuplicate(wamid);
          if (!alreadySent) {
            // Secondary safety net: MongoDB check
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
            // Mark wamid as sent in Redis (25h TTL)
            await redis.markCampaignSent(wamid);
            emit('message:new', await Message.findOne({ wamid }).lean());
            emit('contact:upsert', contact);
          }
        } catch (e) {
          const err = e.response?.data?.error;
          const code = err?.code;

          // 130429 = account-level rate limit → back off 60s, retry in 1h
          if (code === 130429) {
            console.warn(`[campaign.send] Account rate limit (130429) at ${t.waId}. Backing off 60s…`);
            t.lastStatus = 'rate_limited';
            t.lastError = 'Account rate limit — auto-retry in 1 hour.';
            t.lastSentAt = new Date();
            t.retryAfter = new Date(Date.now() + 60 * 60 * 1000);
            await t.save();
            emit('campaign:update', t);
            rateLimited += 1;
            // Drain the token bucket so subsequent sends pace correctly
            await sleep(60000);
            continue;
          }

          // 131049 = per-user marketing cap → retry after 24h
          if (code === 131049) {
            console.warn(`[campaign.send] Per-user cap (131049) for ${t.waId}. Auto-retry in 24h.`);
            t.lastStatus = 'rate_limited';
            t.lastError = 'Meta per-user marketing limit — auto-retry in 24 hours.';
            t.lastSentAt = new Date();
            t.retryAfter = new Date(Date.now() + 24 * 60 * 60 * 1000);
            await t.save();
            emit('campaign:update', t);
            rateLimited += 1;
            continue;
          }

          const notWa = code === 131026 || code === 131056
            || /not.*whatsapp|invalid.*recipient|recipient.*not.*reachable|blocked/i.test(err?.message || '');
          t.lastStatus = notWa ? 'not_whatsapp' : 'failed';
          t.lastError = err?.error_user_msg || err?.message || e.message;
          t.lastSentAt = new Date();
          t.scheduledAt = null;
          t.retryAfter = null;
          await t.save();
          emit('campaign:update', t);
          failed += 1;
          console.warn(`[campaign.send] ${t.waId} -> ${t.lastStatus}: ${t.lastError}`);
        }
      }

      res.json({ ok: true, sent, failed, rateLimited, skipped, total });
    } finally {
      // Always release the lock, even if send threw
      await redis.releaseCampaignLock();
    }
  } catch (e) {
    console.error('[campaign.send]', e.response?.data?.error || e.message);
    res.status(500).json({ error: 'Failed', details: e.response?.data?.error?.message || e.message });
  }
};

// Schedule a send for a future time.
// Body: { ids: [...], scheduledAt: ISO-8601 string }
exports.scheduleSend = async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : null;
    const rawDate = req.body?.scheduledAt;

    if (!rawDate) return res.status(400).json({ error: 'scheduledAt is required.' });

    const scheduledAt = new Date(rawDate);
    if (isNaN(scheduledAt.getTime())) {
      return res.status(400).json({ error: 'Invalid scheduledAt date.' });
    }
    // Must be at least 1 minute in the future.
    if (scheduledAt.getTime() - Date.now() < 60 * 1000) {
      return res.status(400).json({ error: 'Scheduled time must be at least 1 minute in the future.' });
    }

    const filter = ids && ids.length ? { _id: { $in: ids } } : {};
    const targets = await CampaignContact.find(filter);
    if (!targets.length) return res.status(400).json({ error: 'No contacts selected.' });

    for (const t of targets) {
      t.lastStatus = 'scheduled';
      t.scheduledAt = scheduledAt;
      t.lastError = '';
      await t.save();
      emit('campaign:update', t);
    }

    res.json({ ok: true, scheduled: targets.length, scheduledAt });
  } catch (e) {
    console.error('[campaign.scheduleSend]', e.message);
    res.status(500).json({ error: 'Failed', details: e.message });
  }
};

// Cancel a scheduled send for selected contacts (resets them back to queued).
// Body: { ids: [...] }
exports.cancelSchedule = async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : null;
    const filter = ids && ids.length
      ? { _id: { $in: ids }, lastStatus: 'scheduled' }
      : { lastStatus: 'scheduled' };

    const targets = await CampaignContact.find(filter);
    if (!targets.length) return res.json({ ok: true, cancelled: 0 });

    for (const t of targets) {
      t.lastStatus = 'queued';
      t.scheduledAt = null;
      await t.save();
      emit('campaign:update', t);
    }

    res.json({ ok: true, cancelled: targets.length });
  } catch (e) {
    console.error('[campaign.cancelSchedule]', e.message);
    res.status(500).json({ error: 'Failed', details: e.message });
  }
};

module.exports = exports;
