const axios = require('axios');
const FormData = require('form-data');

const GRAPH = () => `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || 'v21.0'}`;
const PHONE_ID = () => process.env.META_PHONE_NUMBER_ID;
const WABA_ID = () => process.env.META_WABA_ID;
const TOKEN = () => process.env.META_ACCESS_TOKEN;

function authHeaders() {
  return { Authorization: `Bearer ${TOKEN()}` };
}

// Upload a media file directly to Meta and return a media id usable in messages.
// Use this to bypass external-URL fetch failures (e.g. Cloudinary 403, encoding issues).
async function uploadMediaToMeta({ buffer, mime, filename }) {
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', mime || 'application/octet-stream');
  form.append('file', buffer, {
    filename: (filename || 'upload').replace(/[^A-Za-z0-9._-]/g, '_'),
    contentType: mime || 'application/octet-stream',
  });
  const { data } = await axios.post(`${GRAPH()}/${PHONE_ID()}/media`, form, {
    headers: { ...authHeaders(), ...form.getHeaders() },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });
  return data; // { id }
}

async function fetchUrlToBuffer(url) {
  const r = await axios.get(url, { responseType: 'arraybuffer' });
  return { buffer: Buffer.from(r.data), mime: r.headers['content-type'] };
}

async function sendText(to, body, context) {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { body, preview_url: true },
  };
  if (context) payload.context = { message_id: context };
  const { data } = await axios.post(`${GRAPH()}/${PHONE_ID()}/messages`, payload, { headers: authHeaders() });
  return data;
}

// Send media. The 3rd argument can be a plain URL string (legacy) OR an object
// { link } / { id }. Prefer { id } (media uploaded via /media endpoint) because
// Meta does not need to fetch from our origin -> no 131053 "could not fetch URL".
async function sendMedia(to, type, source, caption, filename) {
  const media = (typeof source === 'string') ? { link: source } : { ...source };
  if (caption && (type === 'image' || type === 'video' || type === 'document')) media.caption = caption;
  if (filename && type === 'document') media.filename = filename;
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type,
    [type]: media,
  };
  const { data } = await axios.post(`${GRAPH()}/${PHONE_ID()}/messages`, payload, { headers: authHeaders() });
  return data;
}

// Send an interactive message. Use this to render real WhatsApp CTA / quick-reply
// buttons inside the 24h customer service window without paying for a template.
//
// `kind` is "cta_url" (single URL button) or "button" (up to 3 quick-reply buttons).
// `header` is optional and may be:
//   - { type: 'text', text }
//   - { type: 'image'|'video'|'document', link }   <- preferred for cta_url (Meta REQUIRES link, not id)
//   - { type: 'image'|'video'|'document', mediaId } <- works for type=button only
async function sendInteractive(to, { kind, header, body, footer, action, context }) {
  const interactive = { type: kind };
  if (header) {
    if (header.type === 'text') {
      interactive.header = { type: 'text', text: header.text || '' };
    } else if (['image', 'video', 'document'].includes(header.type)) {
      const mediaObj = header.link
        ? { link: header.link }
        : header.mediaId ? { id: header.mediaId } : null;
      if (mediaObj) {
        if (header.type === 'document' && header.filename) mediaObj.filename = header.filename;
        interactive.header = { type: header.type, [header.type]: mediaObj };
      }
    }
  }
  if (body) interactive.body = { text: body };
  if (footer) interactive.footer = { text: footer };
  interactive.action = action;

  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive,
  };
  if (context) payload.context = { message_id: context };
  const { data } = await axios.post(`${GRAPH()}/${PHONE_ID()}/messages`, payload, { headers: authHeaders() });
  return data;
}

async function sendReaction(to, messageId, emoji) {
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'reaction',
    reaction: { message_id: messageId, emoji: emoji || '' },
  };
  const { data } = await axios.post(`${GRAPH()}/${PHONE_ID()}/messages`, payload, { headers: authHeaders() });
  return data;
}

async function markAsRead(messageId) {
  try {
    await axios.post(`${GRAPH()}/${PHONE_ID()}/messages`, {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    }, { headers: authHeaders() });
  } catch (e) { /* noop */ }
}

async function sendTemplateMessage(to, templateName, language, components) {
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: language || 'en_US' },
      ...(components && components.length ? { components } : {}),
    },
  };
  const { data } = await axios.post(`${GRAPH()}/${PHONE_ID()}/messages`, payload, { headers: authHeaders() });
  return data;
}

// --- Media download (incoming messages come as media IDs) ---
async function getMediaUrl(mediaId) {
  const { data } = await axios.get(`${GRAPH()}/${mediaId}`, { headers: authHeaders() });
  return data; // { url, mime_type, sha256, file_size, id, messaging_product }
}

async function downloadMedia(mediaUrl) {
  const { data, headers } = await axios.get(mediaUrl, {
    headers: authHeaders(),
    responseType: 'arraybuffer',
  });
  return { buffer: Buffer.from(data), contentType: headers['content-type'] };
}

// --- Templates ---
async function listTemplates() {
  const { data } = await axios.get(`${GRAPH()}/${WABA_ID()}/message_templates`, {
    headers: authHeaders(),
    params: { limit: 200 },
  });
  return data;
}

async function getTemplateById(id) {
  const { data } = await axios.get(`${GRAPH()}/${id}`, {
    headers: authHeaders(),
    params: { fields: 'name,status,category,language,components,id,rejected_reason' },
  });
  return data;
}

async function createTemplate(payload) {
  // payload shape: { name, language, category, components: [...] }
  const { data } = await axios.post(`${GRAPH()}/${WABA_ID()}/message_templates`, payload, { headers: authHeaders() });
  return data; // { id, status, category }
}

async function deleteTemplate(name) {
  const { data } = await axios.delete(`${GRAPH()}/${WABA_ID()}/message_templates`, {
    headers: authHeaders(),
    params: { name },
  });
  return data;
}

// --- Resumable media upload (for template header samples) ---
// Required by Meta when creating a template with IMAGE/VIDEO/DOCUMENT header.
// Flow:
//   1) POST /{APP_ID}/uploads -> { id: "upload:..." }  (authenticated with APP ACCESS TOKEN)
//   2) POST /{upload:id} with header { file_offset: 0, Authorization: "OAuth USER_ACCESS_TOKEN" }
//      and binary body -> { h: "<header_handle>" }
async function uploadHeaderSample({ fileUrl, fileName, fileType }) {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    // Fallback - return URL as handle; Meta may reject if it needs a real handle.
    return { header_handle: fileUrl };
  }

  // 1) Download the file from Cloudinary (or any URL) into a buffer.
  // Caller-supplied fileType wins (controller has already negotiated a Meta-
  // approved value); only fall back to the response Content-Type or octet
  // when the caller passes nothing.
  const fileResp = await axios.get(fileUrl, { responseType: 'arraybuffer' });
  const buffer = Buffer.from(fileResp.data);
  const respMime = (fileResp.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  const mime = fileType || respMime || 'application/octet-stream';

  // 2) Create upload session - uses App Access Token (app_id|app_secret)
  const appAccessToken = `${appId}|${appSecret}`;
  const createResp = await axios.post(
    `${GRAPH()}/${appId}/uploads`,
    null,
    {
      params: {
        file_name: fileName || 'header',
        file_length: buffer.length,
        file_type: mime,
        access_token: appAccessToken,
      },
    }
  );
  const sessionId = createResp.data.id; // e.g. "upload:MTphdHRhY2..."

  // 3) Upload the binary. Auth here MUST be the user access token via "OAuth <token>"
  const uploadResp = await axios.post(
    `${GRAPH()}/${sessionId}`,
    buffer,
    {
      headers: {
        Authorization: `OAuth ${TOKEN()}`,
        file_offset: '0',
        'Content-Type': mime,
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    }
  );
  const handle = uploadResp.data?.h;
  if (!handle) throw new Error('No header handle returned from Meta upload');
  return { header_handle: handle };
}

// Profile
async function getContactProfile(phone) {
  try {
    const { data } = await axios.get(`${GRAPH()}/${PHONE_ID()}/whatsapp_business_profile`, {
      headers: authHeaders(),
    });
    return data;
  } catch { return null; }
}

module.exports = {
  sendText,
  sendMedia,
  sendInteractive,
  sendReaction,
  sendTemplateMessage,
  markAsRead,
  getMediaUrl,
  downloadMedia,
  listTemplates,
  getTemplateById,
  createTemplate,
  deleteTemplate,
  uploadHeaderSample,
  uploadMediaToMeta,
  fetchUrlToBuffer,
  getContactProfile,
};
