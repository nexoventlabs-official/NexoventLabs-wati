const Category = require('../models/Category');
const Template = require('../models/Template');
const Contact = require('../models/Contact');
const meta = require('../services/metaService');
const bot = require('../services/botService');
const { emit } = require('../services/socketService');
const { deleteByUrl } = require('../config/cloudinary');

// Turn a free-text category name into a Meta-safe template name:
// lowercase, only [a-z0-9_], collapse repeats. e.g. "WhatsApp Automation!" ->
// "whatsapp_automation".
function toTemplateName(name) {
  const base = String(name || 'category')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 480) || 'category';
  return `promo_${base}`;
}

// Build the Meta template components array for a category promo:
// IMAGE header + BODY + a single URL ("DEMO") button.
function buildComponents(cat) {
  const components = [];
  if (cat.headerImageUrl) {
    components.push({
      type: 'HEADER',
      format: 'IMAGE',
      example: { header_handle: [cat.headerImageUrl] },
    });
  }
  components.push({ type: 'BODY', text: cat.bodyContent || cat.name });
  components.push({ type: 'FOOTER', text: 'Nexovent Labs' });
  if (cat.ctaUrl) {
    components.push({
      type: 'BUTTONS',
      buttons: [{ type: 'URL', text: (cat.ctaText || 'DEMO').slice(0, 25), url: cat.ctaUrl }],
    });
  }
  return components;
}

// Keep a Template doc in sync with a category so the existing Templates drawer
// (and Meta submission flow) can broadcast it. Returns the Template doc.
async function upsertTemplateForCategory(cat) {
  const name = cat.templateName || toTemplateName(cat.name);
  const components = buildComponents(cat);
  const header = cat.headerImageUrl
    ? { type: 'IMAGE', mediaUrl: cat.headerImageUrl }
    : { type: 'NONE' };
  const buttons = cat.ctaUrl
    ? [{ type: 'URL', text: (cat.ctaText || 'DEMO').slice(0, 25), url: cat.ctaUrl }]
    : [];

  let tpl = cat.templateId ? await Template.findById(cat.templateId) : null;
  if (!tpl) tpl = await Template.findOne({ name, language: 'en_US' });

  if (tpl) {
    // Don't clobber an already-approved Meta template's status; just refresh
    // the local editable copy.
    tpl.header = header;
    tpl.body = cat.bodyContent || cat.name;
    tpl.footer = 'Nexovent Labs';
    tpl.buttons = buttons;
    tpl.category = 'MARKETING';
    if (tpl.status === 'DRAFT') tpl.components = components;
    await tpl.save();
  } else {
    tpl = await Template.create({
      name,
      language: 'en_US',
      category: 'MARKETING',
      status: 'DRAFT',
      header,
      body: cat.bodyContent || cat.name,
      footer: 'Nexovent Labs',
      buttons,
      components,
    });
  }
  emit('template:update', tpl);
  return tpl;
}

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
      templateName: toTemplateName(b.name),
    });

    // Mirror to a local Template doc so it can be submitted to Meta later.
    const tpl = await upsertTemplateForCategory(cat);
    cat.templateId = tpl._id;
    cat.templateName = tpl.name;
    cat.metaStatus = tpl.status;
    await cat.save();

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

    // Track whether the old header image was replaced so we can clean Cloudinary.
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

    // Keep the linked Template doc current.
    const tpl = await upsertTemplateForCategory(cat);
    cat.templateId = tpl._id;
    cat.templateName = tpl.name;
    cat.metaStatus = tpl.status;
    await cat.save();

    // Best-effort Cloudinary cleanup of replaced assets.
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

    // Best-effort media cleanup.
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

// Submit the category's linked template to Meta for approval. Reuses the
// templateController submit logic via a direct Meta call.
exports.submitToMeta = async (req, res) => {
  try {
    const cat = await Category.findById(req.params.id);
    if (!cat) return res.status(404).json({ error: 'Not found' });
    if (!cat.headerImageUrl) return res.status(400).json({ error: 'Header image required before submitting to Meta.' });
    if (!cat.bodyContent) return res.status(400).json({ error: 'Body content required before submitting to Meta.' });

    const tpl = await upsertTemplateForCategory(cat);

    // Build the Meta payload, swapping the Cloudinary header URL for an
    // uploaded header_handle (Meta requires a resumable-upload handle).
    const components = JSON.parse(JSON.stringify(tpl.components || buildComponents(cat)));
    const header = components.find((c) => c.type === 'HEADER');
    if (header && header.format === 'IMAGE') {
      const mediaUrl = cat.headerImageUrl;
      const fileName = (mediaUrl.split('/').pop() || 'header').split('?')[0].replace(/[^A-Za-z0-9._-]/g, '_');
      const { header_handle } = await meta.uploadHeaderSample({
        fileUrl: mediaUrl,
        fileName: fileName.endsWith('.jpg') || fileName.endsWith('.png') ? fileName : `${fileName}.jpg`,
        fileType: 'image/jpeg',
      });
      header.example = { header_handle: [header_handle] };
    }

    const payload = { name: tpl.name, language: tpl.language, category: tpl.category, components };
    let resp;
    try {
      resp = await meta.createTemplate(payload);
    } catch (e) {
      const msg = e.response?.data?.error?.message || '';
      const alreadyExists = /already exists|exists with the same name/i.test(msg);
      if (!alreadyExists) throw e;
      const list = await meta.listTemplates();
      const found = (list.data || []).find((t) => t.name === tpl.name && t.language === tpl.language);
      if (!found) throw e;
      resp = { id: found.id, status: found.status };
    }

    tpl.metaId = resp.id;
    tpl.status = (resp.status || 'PENDING').toUpperCase();
    tpl.components = components;
    tpl.lastSyncedAt = new Date();
    await tpl.save();
    emit('template:update', tpl);

    cat.metaStatus = tpl.status;
    cat.metaRejectedReason = '';
    await cat.save();
    emit('category:update', cat);

    res.json(cat);
  } catch (e) {
    const metaErr = e.response?.data?.error;
    const friendly = metaErr?.error_user_msg || metaErr?.message || e.message || 'Submit failed';
    console.error('[category.submitToMeta]', metaErr || e.message);
    res.status(500).json({ error: friendly, details: e.response?.data || e.message });
  }
};

// Send a category promo to an arbitrary number (admin "test" / manual send).
// Body: { waId }  - if the contact doesn't exist we create it.
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
