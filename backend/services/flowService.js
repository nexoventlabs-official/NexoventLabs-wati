const meta = require('./metaService');
const { buildFlowJSON } = require('./flowJson');
const Setting = require('../models/Setting');
const Category = require('../models/Category');

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

// Build the runtime payload (active categories) injected into the flow message.
async function buildCategoryFlowData() {
  const cats = await Category.find({ active: true }).sort({ sortOrder: 1, name: 1 }).lean();
  return {
    heading: 'What are you interested in?',
    subheading: 'Pick a service and we will share a quick demo.',
    categories: cats.map((c) => ({
      id: `cat_${c._id}`,
      title: (c.name || 'Option').slice(0, 30),
      description: (c.description || '').slice(0, 72),
    })),
  };
}

// Send the category-picker flow to a contact. Returns the Meta response or null
// when no flow / no categories are available (so the caller can fall back to the
// plain button/list menu).
async function sendCategoryFlow(waId, { header, body, footer } = {}) {
  const flowId = await getFlowId();
  if (!flowId) return null;
  const status = await getFlowStatus();
  const data = await buildCategoryFlowData();
  if (!data.categories.length) return null;

  return meta.sendFlowMessage(waId, {
    flowId,
    flowCta: 'View Services',
    header: header || { type: 'text', text: 'Nexovent Labs' },
    body: body || 'Welcome to Nexovent Labs 🚀\n\nTap below to explore our services and get a quick demo.',
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
