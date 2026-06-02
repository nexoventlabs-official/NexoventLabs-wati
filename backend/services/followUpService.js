const Setting = require('../models/Setting');
const flowImages = require('./flowImages');
const meta = require('./metaService');
const redis = require('./redisService');
const Message = require('../models/Message');
const { emit } = require('./socketService');
const { toJpgUrl } = require('./imageBase64');

// ---- Config ---------------------------------------------------------------
// Delay after a service pick before we send the Interested / Not Interested
// prompt. Editable via Setting key (minutes) but defaults to 5 minutes.
const DELAY_KEY = 'followup_delay_minutes';
const DEFAULT_DELAY_MIN = 5;

// Editable copy + the call number used in the Interested / Not Interested replies.
const KEYS = {
  callNumber: 'followup_call_number',
  promptBody: 'followup_prompt_body',
  interestedBody: 'followup_interested_body',
  notInterestedBody: 'followup_not_interested_body',
  callCtaText: 'followup_call_cta',
};

const DEFAULTS = {
  callNumber: '918106811285',
  promptBody:
    'Did our service catch your interest? 👀\n\nLet us know and our team will help you get started.',
  interestedBody:
    '🎉 Awesome! Our team will contact you shortly to walk you through everything and get you started.\n\nPrefer to talk now? Tap below to call us.',
  notInterestedBody:
    'No problem at all 🙏\n\nWhenever you decide to transform your business into a strong *digital presence*, we are just one tap away. Save our number and call us anytime.',
  callCtaText: 'Call Us',
};

// Button ids for the follow-up reply buttons.
const INTERESTED_ID = 'lead_interested';
const NOT_INTERESTED_ID = 'lead_not_interested';

async function getDelayMinutes() {
  const v = await Setting.get(DELAY_KEY, DEFAULT_DELAY_MIN);
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_DELAY_MIN;
}

async function getConfig() {
  const out = {};
  for (const [k, key] of Object.entries(KEYS)) {
    out[k] = (await Setting.get(key, DEFAULTS[k])) || DEFAULTS[k];
  }
  out.delayMinutes = await getDelayMinutes();
  out.promptHeader = await flowImages.getUrl('followup_header');
  out.interestedHeader = await flowImages.getUrl('interested_header');
  out.notInterestedHeader = await flowImages.getUrl('not_interested_header');
  return out;
}

async function setConfig(patch = {}) {
  for (const [k, key] of Object.entries(KEYS)) {
    if (patch[k] !== undefined) await Setting.put(key, String(patch[k]));
  }
  if (patch.delayMinutes !== undefined) {
    await Setting.put(DELAY_KEY, Number(patch.delayMinutes) || DEFAULT_DELAY_MIN);
  }
  return getConfig();
}

// Record an outbound bot message into the panel.
async function record(contact, { wamid, type, text, mediaUrl, caption, templateData }) {
  const seq = await redis.nextSeq();
  const msg = await Message.create({
    contact: contact._id,
    waId: contact.waId,
    direction: 'outbound',
    wamid: wamid || null,
    type: type || 'text',
    text: text || '',
    mediaUrl: mediaUrl || '',
    caption: caption || '',
    ...(templateData ? { templateData } : {}),
    status: 'sent',
    seq,
  });
  contact.lastMessageAt = new Date();
  contact.lastMessagePreview = caption || text || `[${type || 'text'}]`;
  await contact.save();
  emit('message:new', msg);
  emit('contact:upsert', contact);
  return msg;
}

// Schedule the follow-up: stamp followUpDueAt = now + delay. The scheduler loop
// (started in server.js) sends it when due.
async function scheduleFollowUp(contact) {
  const delay = await getDelayMinutes();
  contact.followUpDueAt = new Date(Date.now() + delay * 60 * 1000);
  contact.followUpSent = false;
  await contact.save();
}

// Send the Interested / Not Interested prompt (image header + body + 2 buttons).
async function sendFollowUpPrompt(contact) {
  const cfg = await getConfig();
  const headerUrl = cfg.promptHeader ? toJpgUrl(cfg.promptHeader) : '';
  const action = {
    buttons: [
      { type: 'reply', reply: { id: INTERESTED_ID, title: 'Interested' } },
      { type: 'reply', reply: { id: NOT_INTERESTED_ID, title: 'Not Interested' } },
    ],
  };
  const header = headerUrl ? { type: 'image', link: headerUrl } : { type: 'text', text: 'Nexovent Labs' };
  const r = await meta.sendInteractive(contact.waId, {
    kind: 'button',
    header,
    body: cfg.promptBody,
    footer: 'Nexovent Labs',
    action,
  });
  await record(contact, {
    wamid: r?.messages?.[0]?.id,
    type: headerUrl ? 'image' : 'interactive',
    mediaUrl: headerUrl || '',
    text: cfg.promptBody,
    caption: headerUrl ? cfg.promptBody : '',
  });
}

// Send the branched reply after the customer taps Interested / Not Interested.
// `interested` = boolean. Both branches: image header + body + a Call CTA.
async function sendLeadReply(contact, interested) {
  const cfg = await getConfig();
  const body = interested ? cfg.interestedBody : cfg.notInterestedBody;
  const headerUrlRaw = interested ? cfg.interestedHeader : cfg.notInterestedHeader;
  const headerUrl = headerUrlRaw ? toJpgUrl(headerUrlRaw) : '';
  const callNumber = String(cfg.callNumber || '').replace(/[^\d+]/g, '');
  const ctaText = (cfg.callCtaText || 'Call Us').slice(0, 20);
  // WhatsApp cta_url with a tel: link opens the dialer.
  const ctaUrl = callNumber ? `tel:${callNumber.startsWith('+') ? callNumber : '+' + callNumber}` : '';

  const templateData = {
    header: headerUrl ? { type: 'IMAGE', mediaUrl: headerUrl } : { type: 'NONE' },
    body,
    footer: 'Nexovent Labs',
    buttons: ctaUrl ? [{ type: 'URL', text: ctaText, url: ctaUrl }] : [],
  };

  if (ctaUrl) {
    try {
      const header = headerUrl ? { type: 'image', link: headerUrl } : { type: 'text', text: 'Nexovent Labs' };
      const r = await meta.sendInteractive(contact.waId, {
        kind: 'cta_url',
        header,
        body,
        footer: 'Nexovent Labs',
        action: { name: 'cta_url', parameters: { display_text: ctaText, url: ctaUrl } },
      });
      return record(contact, {
        wamid: r?.messages?.[0]?.id,
        type: headerUrl ? 'image' : 'text',
        mediaUrl: headerUrl || '',
        text: body,
        caption: body,
        templateData,
      });
    } catch (e) {
      console.warn('[followUp] cta_url reply failed, falling back:', e.response?.data?.error?.message || e.message);
    }
  }

  // Fallback: image + caption (number inlined) or plain text.
  const inline = callNumber ? `${body}\n\n📞 ${ctaText}: ${callNumber}` : body;
  if (headerUrl) {
    let mediaRef = { link: headerUrl };
    try {
      const { buffer } = await meta.fetchUrlToBuffer(headerUrl);
      const upl = await meta.uploadMediaToMeta({ buffer, mime: 'image/jpeg', filename: 'lead.jpg' });
      mediaRef = { id: upl.id };
    } catch { /* use link */ }
    const r = await meta.sendMedia(contact.waId, 'image', mediaRef, inline);
    return record(contact, { wamid: r?.messages?.[0]?.id, type: 'image', mediaUrl: headerUrl, text: inline, caption: inline, templateData });
  }
  const r = await meta.sendText(contact.waId, inline);
  return record(contact, { wamid: r?.messages?.[0]?.id, type: 'text', text: inline, templateData });
}

module.exports = {
  getConfig,
  setConfig,
  scheduleFollowUp,
  sendFollowUpPrompt,
  sendLeadReply,
  getDelayMinutes,
  INTERESTED_ID,
  NOT_INTERESTED_ID,
  DEFAULTS,
};
