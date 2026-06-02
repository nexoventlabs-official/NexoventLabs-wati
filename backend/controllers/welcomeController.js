const welcomeService = require('../services/welcomeService');
const flowImages = require('../services/flowImages');
const { deleteByUrl } = require('../config/cloudinary');

// GET /api/welcome -> editable welcome copy + current header/banner images.
exports.get = async (_req, res) => {
  try {
    const data = await welcomeService.getWelcome();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Failed', details: e.message });
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
