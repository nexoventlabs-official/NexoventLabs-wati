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

// Send the welcome template to selected campaign contacts.
// Body: { ids: [campaignContactId, ...] }  (omit/empty = all)
exports.send = async (req, res) => {
  try {
    // Pull the live status from Meta first - our locally cached status may lag
    // behind (webhook missed / not refreshed) even though Meta has approved it.
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

    const ids = Array.isArray(req.body?.ids) ? req.body.ids : null;
    const filter = ids && ids.length ? { _id: { $in: ids } } : {};
    const targets = await CampaignContact.find(filter);
    if (!targets.length) return res.status(400).json({ error: 'No contacts selected.' });

    const tplName = await welcomeTemplate.getTemplateName();
    const welcome = await welcomeService.getWelcome();

    const results = { sent: 0, failed: 0, total: targets.length };

    // Send sequentially to keep Meta happy and statuses ordered.
    for (const t of targets) {
      try {
        const resp = await welcomeTemplate.sendToContact(t.waId);
        const wamid = resp?.messages?.[0]?.id || '';

        t.lastStatus = 'sent';
        t.lastError = '';
        t.lastWamid = wamid;
        t.lastSentAt = new Date();
        t.sendCount = (t.sendCount || 0) + 1;
        await t.save();
        emit('campaign:update', t);
        results.sent += 1;

        // Mirror into the wati panel: ensure a Contact + a template Message so
        // the conversation shows up in the chat list.
        let contact = await Contact.findOne({ waId: t.waId });
        if (!contact) contact = await Contact.create({ waId: t.waId, name: t.name || '' });
        const seq = await redis.nextSeq();
        const msg = await Message.create({
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
        emit('message:new', msg);
        emit('contact:upsert', contact);
      } catch (e) {
        const err = e.response?.data?.error;
        const code = err?.code;
        // 131026 / 131056 -> recipient is not a valid WhatsApp user. Mark and
        // never auto-retry so we don't waste money.
        const notWa = code === 131026 || code === 131056 || /not.*whatsapp|invalid.*recipient/i.test(err?.message || '');
        t.lastStatus = notWa ? 'not_whatsapp' : 'failed';
        t.lastError = err?.error_user_msg || err?.message || e.message;
        t.lastSentAt = new Date();
        await t.save();
        emit('campaign:update', t);
        results.failed += 1;
        console.warn(`[campaign.send] ${t.waId} -> ${t.lastStatus}: ${t.lastError}`);
      }
    }

    res.json({ ok: true, ...results });
  } catch (e) {
    console.error('[campaign.send]', e.response?.data?.error || e.message);
    res.status(500).json({ error: 'Failed', details: e.response?.data?.error?.message || e.message });
  }
};

module.exports = exports;
