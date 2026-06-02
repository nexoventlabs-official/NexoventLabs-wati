const meta = require('./metaService');
const { buildFlowJSON } = require('./flowJson');
const Setting = require('../models/Setting');
const Category = require('../models/Category');
const flowImages = require('./flowImages');
const { urlToBase64 } = require('./imageBase64');

const FLOW_ID_KEY = 'whatsapp_flow_id';
const FLOW_STATUS_KEY = 'whatsapp_flow_status';
const FLOW_NAME = 'Nexovent Labs Categories';

// Resolve the persisted flow id (env override wins so a hard-coded id can be
// pinned in production without DB access).
async function getFlowId() {
  if (process.env.WHATSAPP_FLOW_ID) return process.env.WHATSAPP_FLOW_ID;
  return Setting.get(FLOW_ID_KEY, null);
}

async function getFlowStatus() {
  if (process.env.WHATSAPP_FLOW_STATUS) return process.env.WHATSAPP_FLOW_STATUS;
  return Setting.get(FLOW_STATUS_KEY, 'DRAFT');
}

// Create the flow shell if we don't have one yet, push the latest JSON, and
// publish. Idempotent: safe to call repeatedly (e.g. from an admin button).
// Returns { flowId, status, validationErrors }.
async function ensureFlowPublished() {
  let flowId = await getFlowId();

  // Verify an existing id is still valid; if Meta 404s, drop it and recreate.
  if (flowId) {
    try {
      await meta.getFlow(flowId);
    } catch (e) {
      console.warn('[flowService] stored flow id invalid, recreating:', e.response?.data?.error?.message || e.message);
      flowId = null;
    }
  }

  if (!flowId) {
    const created = await meta.createFlow(FLOW_NAME, ['OTHER']);
    flowId = created.id;
    await Setting.put(FLOW_ID_KEY, flowId);
    console.log('[flowService] created flow', flowId);
  }

  // Upload the (latest) JSON.
  const upd = await meta.updateFlowJSON(flowId, buildFlowJSON());
  const validationErrors = upd?.validation_errors || [];
  if (validationErrors.length) {
    console.warn('[flowService] flow validation warnings:', JSON.stringify(validationErrors));
  }

  // Publish (ignore "already published" style errors).
  let status = 'DRAFT';
  try {
    await meta.publishFlow(flowId);
    status = 'PUBLISHED';
  } catch (e) {
    const msg = e.response?.data?.error?.message || e.message;
    if (/already.*published/i.test(msg)) {
      status = 'PUBLISHED';
    } else {
      console.warn('[flowService] publish failed, kept DRAFT:', msg);
    }
  }
  await Setting.put(FLOW_STATUS_KEY, status);

  return { flowId, status, validationErrors };
}

// Build the runtime payload (banner + active categories with base64 logos)
// injected into the flow message. WhatsApp Flows require base64 images, so we
// download+encode the banner and each category logo here.
async function buildCategoryFlowData() {
  const cats = await Category.find({ active: true }).sort({ sortOrder: 1, name: 1 }).lean();
  const bannerUrl = await flowImages.getUrl('welcome_flow_banner');
  const bannerB64 = bannerUrl ? await urlToBase64(bannerUrl, { width: 1000, height: 200 }) : '';

  // Encode each category logo (square-ish thumbnail) in parallel.
  const categories = await Promise.all(
    cats.map(async (c) => {
      const logo = c.logoUrl
        ? await urlToBase64(c.logoUrl, { width: 200, height: 200, crop: 'fill' })
        : '';
      const row = {
        id: `cat_${c._id}`,
        title: (c.name || 'Option').slice(0, 30),
        description: (c.description || '').slice(0, 72),
      };
      // Only attach `image` when we actually have base64 - an empty string makes
      // some WhatsApp clients hide the whole row.
      if (logo) row.image = logo;
      return row;
    })
  );

  return {
    has_banner: !!bannerB64,
    banner: bannerB64,
    heading: 'What are you interested in?',
    subheading: 'Pick a service and we will share a quick demo.',
    categories,
  };
}

// Send the category-picker flow to a contact, fronted by an IMAGE header +
// promo body + "View Services" CTA. Returns the Meta response or null when no
// flow / no categories are available (so the caller can fall back).
async function sendCategoryFlow(waId, { body, footer } = {}) {
  const flowId = await getFlowId();
  if (!flowId) return null;
  const status = await getFlowStatus();
  const data = await buildCategoryFlowData();
  if (!data.categories.length) return null;

  // Image header for the welcome flow message (uploaded via the Flow Images page).
  const headerUrl = await flowImages.getUrl('welcome_header');
  let header;
  if (headerUrl) header = { type: 'image', link: headerUrl };
  else header = { type: 'text', text: 'Nexovent Labs' };

  return meta.sendFlowMessage(waId, {
    flowId,
    flowCta: 'View Services',
    header,
    body: body || 'Convert your business into WhatsApp 🚀\n\nGrow your business from today and start your *15 days FREE trial*. Tap *View Services* to explore and get a quick demo.',
    footer: footer || 'Nexovent Labs · WhatsApp Automation',
    flowToken: `nxv_${waId}_${Date.now()}`,
    flowActionPayload: { screen: 'CATEGORY_SELECT', data },
    mode: status === 'PUBLISHED' ? 'published' : 'draft',
  });
}

module.exports = {
  ensureFlowPublished,
  sendCategoryFlow,
  getFlowId,
  getFlowStatus,
  buildCategoryFlowData,
  FLOW_ID_KEY,
  FLOW_STATUS_KEY,
};
