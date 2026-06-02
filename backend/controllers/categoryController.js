const Category = require('../models/Category');
const Contact = require('../models/Contact');
const bot = require('../services/botService');
const { emit } = require('../services/socketService');
const { deleteByUrl } = require('../config/cloudinary');

// NOTE: Categories are sent entirely via code (interactive cta_url / flow). We
// intentionally do NOT create or submit Meta message templates for them.

exports.list = async (req, res) => {
  const items = await Category.find().sort({ sortOrder: 1, name: 1 }).lean();
  res.json(items);
};

exports.get = async (req, res) => {
  const item = await Category.findById(req.params.id).lean();
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(item);
};

exports.create = async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.name || !String(b.name).trim()) return res.status(400).json({ error: 'name required' });
    const cat = await Category.create({
      name: String(b.name).trim(),
      description: b.description || '',
      logoUrl: b.logoUrl || '',
      headerImageUrl: b.headerImageUrl || '',
      bodyContent: b.bodyContent || '',
      ctaText: b.ctaText || 'DEMO',
      ctaUrl: b.ctaUrl || '',
      active: b.active !== false && b.active !== 'false',
      sortOrder: parseInt(b.sortOrder || '0', 10) || 0,
    });
    emit('category:update', cat);
    res.status(201).json(cat);
  } catch (e) {
    console.error('[category.create]', e.message);
    res.status(500).json({ error: 'Failed', details: e.message });
  }
};

exports.update = async (req, res) => {
  try {
    const cat = await Category.findById(req.params.id);
    if (!cat) return res.status(404).json({ error: 'Not found' });
    const b = req.body || {};

    // Track replaced assets so we can clean Cloudinary afterwards.
    const prevHeader = cat.headerImageUrl;
    const prevLogo = cat.logoUrl;

    if (b.name !== undefined) cat.name = String(b.name).trim();
    if (b.description !== undefined) cat.description = b.description;
    if (b.logoUrl !== undefined) cat.logoUrl = b.logoUrl;
    if (b.headerImageUrl !== undefined) cat.headerImageUrl = b.headerImageUrl;
    if (b.bodyContent !== undefined) cat.bodyContent = b.bodyContent;
    if (b.ctaText !== undefined) cat.ctaText = b.ctaText || 'DEMO';
    if (b.ctaUrl !== undefined) cat.ctaUrl = b.ctaUrl;
    if (b.active !== undefined) cat.active = b.active === true || b.active === 'true';
    if (b.sortOrder !== undefined) cat.sortOrder = parseInt(b.sortOrder, 10) || 0;
    await cat.save();

    if (b.headerImageUrl !== undefined && prevHeader && prevHeader !== cat.headerImageUrl) {
      deleteByUrl(prevHeader).catch(() => {});
    }
    if (b.logoUrl !== undefined && prevLogo && prevLogo !== cat.logoUrl) {
      deleteByUrl(prevLogo).catch(() => {});
    }

    emit('category:update', cat);
    res.json(cat);
  } catch (e) {
    console.error('[category.update]', e.message);
    res.status(500).json({ error: 'Failed', details: e.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const cat = await Category.findById(req.params.id);
    if (!cat) return res.status(404).json({ error: 'Not found' });

    if (cat.headerImageUrl) deleteByUrl(cat.headerImageUrl).catch(() => {});
    if (cat.logoUrl) deleteByUrl(cat.logoUrl).catch(() => {});

    await cat.deleteOne();
    emit('category:delete', { id: req.params.id });
    res.json({ ok: true });
  } catch (e) {
    console.error('[category.remove]', e.message);
    res.status(500).json({ error: 'Failed', details: e.message });
  }
};

// Send a category promo to an arbitrary number (admin "test" / manual send).
// Body: { waId } - if the contact doesn't exist we create it.
exports.sendTest = async (req, res) => {
  try {
    const cat = await Category.findById(req.params.id);
    if (!cat) return res.status(404).json({ error: 'Not found' });
    const waId = String(req.body?.waId || '').replace(/\D/g, '');
    if (!waId) return res.status(400).json({ error: 'waId required' });

    let contact = await Contact.findOne({ waId });
    if (!contact) contact = await Contact.create({ waId, name: '' });

    await bot.markCategoryChosen(contact, cat);
    const msg = await bot.sendCategoryPromo(contact, cat);
    res.json({ ok: true, message: msg });
  } catch (e) {
    console.error('[category.sendTest]', e.response?.data?.error?.message || e.message);
    res.status(500).json({ error: 'Failed', details: e.response?.data?.error?.message || e.message });
  }
};
