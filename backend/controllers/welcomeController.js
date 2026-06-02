const welcomeService = require('../services/welcomeService');
const welcomeTemplate = require('../services/welcomeTemplateService');
const flowImages = require('../services/flowImages');
const Contact = require('../models/Contact');
const { deleteByUrl } = require('../config/cloudinary');

// GET /api/welcome -> editable welcome copy + current header/banner images + template status.
exports.get = async (_req, res) => {
  try {
    const data = await welcomeService.getWelcome();
    const template = await welcomeTemplate.getStatus();
    res.json({ ...data, template });
  } catch (e) {
    res.status(500).json({ error: 'Failed', details: e.message });
  }
};

// POST /api/welcome/template/submit -> create / submit the welcome template to Meta.
exports.submitTemplate = async (req, res) => {
  try {
    const template = await welcomeTemplate.submit();
    res.json({ ok: true, template });
  } catch (e) {
    const metaErr = e.response?.data?.error;
    const friendly = metaErr?.error_user_msg || metaErr?.message || e.message || 'Submit failed';
    console.error('[welcome.submitTemplate]', metaErr || e.message);
    res.status(500).json({ error: friendly, details: e.response?.data || e.message });
  }
};

// POST /api/welcome/template/refresh -> refresh approval status from Meta.
exports.refreshTemplate = async (_req, res) => {
  try {
    const template = await welcomeTemplate.refresh();
    res.json({ ok: true, template });
  } catch (e) {
    res.status(500).json({ error: 'Failed', details: e.message });
  }
};

// POST /api/welcome/template/send  body: { waId }
// Sends the approved welcome template to a (possibly brand-new) number.
exports.sendTemplate = async (req, res) => {
  try {
    const waId = String(req.body?.waId || '').replace(/\D/g, '');
    if (!waId) return res.status(400).json({ error: 'waId required' });

    const { status } = await welcomeTemplate.getStatus();
    if (status !== 'APPROVED') {
      return res.status(400).json({ error: `Template is ${status}. Submit it and wait for Meta approval before sending.` });
    }

    const resp = await welcomeTemplate.sendToContact(waId);
    // Ensure a contact exists so the conversation shows in the panel.
    let contact = await Contact.findOne({ waId });
    if (!contact) contact = await Contact.create({ waId, name: '' });
    res.json({ ok: true, wamid: resp?.messages?.[0]?.id || null });
  } catch (e) {
    const metaErr = e.response?.data?.error;
    const friendly = metaErr?.error_user_msg || metaErr?.message || e.message || 'Send failed';
    console.error('[welcome.sendTemplate]', metaErr || e.message);
    res.status(500).json({ error: friendly, details: e.response?.data || e.message });
  }
};

// PATCH /api/welcome  body: { body?, footer?, cta? }
exports.update = async (req, res) => {
  try {
    const { body, footer, cta } = req.body || {};
    const data = await welcomeService.setWelcome({ body, footer, cta });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Failed', details: e.message });
  }
};

// PUT /api/welcome/image/:slot  body: { url, publicId? }
// slot = 'header' | 'banner'. Image bytes are uploaded via /api/upload first.
const SLOT_KEY = { header: 'welcome_header', banner: 'welcome_flow_banner' };

exports.setImage = async (req, res) => {
  try {
    const key = SLOT_KEY[req.params.slot];
    if (!key) return res.status(400).json({ error: 'Unknown slot' });
    const url = req.body?.url || '';
    if (!url) return res.status(400).json({ error: 'url required' });

    const FlowImage = require('../models/FlowImage');
    const existing = await FlowImage.findOne({ key });
    if (existing?.url && existing.url !== url) deleteByUrl(existing.url).catch(() => {});

    await FlowImage.findOneAndUpdate(
      { key },
      { $set: { url, publicId: req.body?.publicId || '' } },
      { upsert: true, new: true }
    );
    const data = await welcomeService.getWelcome();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Failed', details: e.message });
  }
};

exports.removeImage = async (req, res) => {
  try {
    const key = SLOT_KEY[req.params.slot];
    if (!key) return res.status(400).json({ error: 'Unknown slot' });
    const FlowImage = require('../models/FlowImage');
    const doc = await FlowImage.findOne({ key });
    if (doc?.url) deleteByUrl(doc.url).catch(() => {});
    await FlowImage.updateOne({ key }, { $set: { url: '', publicId: '' } });
    const data = await welcomeService.getWelcome();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Failed', details: e.message });
  }
};
