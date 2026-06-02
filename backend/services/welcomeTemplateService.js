const meta = require('./metaService');
const Setting = require('../models/Setting');
const welcomeService = require('./welcomeService');
const flowService = require('./flowService');
const { toJpgUrl } = require('./imageBase64');

// The welcome message is mirrored to a single reusable Meta template so it can
// be sent to brand-new users (outside the 24h service window). The category
// list stays DYNAMIC - it is injected into the flow button's flow_action_data
// at send time, so we never have to re-submit the template when categories change.

const NAME_KEY = 'welcome_template_name';
const META_ID_KEY = 'welcome_template_meta_id';
const STATUS_KEY = 'welcome_template_status';
const LANG_KEY = 'welcome_template_language';

const DEFAULT_NAME = 'nexovent_welcome';
const DEFAULT_LANG = 'en_US';
const NAVIGATE_SCREEN = 'CATEGORY_SELECT';

async function getTemplateName() {
  return (await Setting.get(NAME_KEY, DEFAULT_NAME)) || DEFAULT_NAME;
}
async function getLanguage() {
  return (await Setting.get(LANG_KEY, DEFAULT_LANG)) || DEFAULT_LANG;
}

async function getStatus() {
  const [name, metaId, status, language] = await Promise.all([
    getTemplateName(),
    Setting.get(META_ID_KEY, null),
    Setting.get(STATUS_KEY, 'NONE'),
    getLanguage(),
  ]);
  return { name, metaId: metaId || null, status: status || 'NONE', language };
}

// Build the components array used to CREATE the template on Meta.
function buildCreateComponents({ body, footer, cta, headerHandle, flowId }) {
  const components = [];
  if (headerHandle) {
    components.push({ type: 'HEADER', format: 'IMAGE', example: { header_handle: [headerHandle] } });
  }
  components.push({ type: 'BODY', text: body });
  if (footer) components.push({ type: 'FOOTER', text: footer.slice(0, 60) });
  components.push({
    type: 'BUTTONS',
    buttons: [
      {
        type: 'FLOW',
        text: (cta || 'View Services').slice(0, 25),
        flow_id: String(flowId),
        flow_action: 'navigate',
        navigate_screen: NAVIGATE_SCREEN,
      },
    ],
  });
  return components;
}

// Create / re-submit the welcome template on Meta. Requires a header image and
// a published flow id. Returns { name, status, metaId }.
async function submit() {
  const welcome = await welcomeService.getWelcome();
  if (!welcome.headerImage) throw new Error('Upload a welcome header image first (Welcome Details).');

  const flowId = await flowService.getFlowId();
  if (!flowId) throw new Error('Publish the WhatsApp Flow first (Categories page).');

  const name = await getTemplateName();
  const language = await getLanguage();

  // Upload the header image as a resumable-upload sample (Meta needs a handle).
  const headerUrl = toJpgUrl(welcome.headerImage);
  const { header_handle } = await meta.uploadHeaderSample({
    fileUrl: headerUrl,
    fileName: 'welcome_header.jpg',
    fileType: 'image/jpeg',
  });

  const components = buildCreateComponents({
    body: welcome.body,
    footer: welcome.footer,
    cta: welcome.cta,
    headerHandle: header_handle,
    flowId,
  });

  const payload = { name, language, category: 'MARKETING', components };

  let resp;
  try {
    resp = await meta.createTemplate(payload);
  } catch (e) {
    const msg = e.response?.data?.error?.message || '';
    const alreadyExists = /already exists|exists with the same name/i.test(msg);
    if (!alreadyExists) throw e;
    // Already on Meta - look it up and adopt its status.
    const list = await meta.listTemplates();
    const found = (list.data || []).find((t) => t.name === name && t.language === language);
    if (!found) throw e;
    resp = { id: found.id, status: found.status };
  }

  await Setting.put(META_ID_KEY, resp.id);
  await Setting.put(STATUS_KEY, (resp.status || 'PENDING').toUpperCase());
  return getStatus();
}

// Refresh the template's approval status from Meta.
async function refresh() {
  const metaId = await Setting.get(META_ID_KEY, null);
  if (!metaId) return getStatus();
  try {
    const data = await meta.getTemplateById(metaId);
    await Setting.put(STATUS_KEY, (data.status || 'PENDING').toUpperCase());
  } catch (e) {
    console.warn('[welcomeTemplate.refresh]', e.response?.data?.error?.message || e.message);
  }
  return getStatus();
}

// Send the APPROVED welcome template to a contact (works outside the 24h window).
// Dynamic category data is injected into the flow button at send time.
async function sendToContact(waId) {
  const name = await getTemplateName();
  const language = await getLanguage();
  const welcome = await welcomeService.getWelcome();

  // 1) Header image -> upload to Meta to get a media id (most reliable).
  let headerParam = null;
  if (welcome.headerImage) {
    const headerUrl = toJpgUrl(welcome.headerImage);
    try {
      const { buffer } = await meta.fetchUrlToBuffer(headerUrl);
      const upl = await meta.uploadMediaToMeta({ buffer, mime: 'image/jpeg', filename: 'welcome_header.jpg' });
      headerParam = { type: 'image', image: { id: upl.id } };
    } catch (e) {
      headerParam = { type: 'image', image: { link: headerUrl } };
    }
  }

  // 2) Dynamic flow data (banner + active categories with base64 logos).
  const flowData = await flowService.buildCategoryFlowData();

  const components = [];
  if (headerParam) components.push({ type: 'header', parameters: [headerParam] });
  components.push({
    type: 'button',
    sub_type: 'flow',
    index: '0',
    parameters: [
      {
        type: 'action',
        action: {
          flow_token: `nxv_${waId}_${Date.now()}`,
          flow_action_data: flowData,
        },
      },
    ],
  });

  return meta.sendTemplateMessage(waId, name, language, components);
}

module.exports = {
  getStatus,
  submit,
  refresh,
  sendToContact,
  getTemplateName,
  getLanguage,
  NAME_KEY,
  META_ID_KEY,
  STATUS_KEY,
  NAVIGATE_SCREEN,
};
