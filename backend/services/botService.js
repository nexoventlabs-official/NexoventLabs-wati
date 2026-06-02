const Category = require('../models/Category');
const Message = require('../models/Message');
const meta = require('./metaService');
const { emit } = require('./socketService');
const redis = require('./redisService');

// Greetings that trigger the welcome / category menu.
const GREETING_RE = /^\s*(hi+|h+e+l+o+|h+e+y+|hii+|hello+|menu|start|hai|namaste|namaskaram|services?|demo)\b/i;

// Re-send the welcome at most once per this window so a burst of "hi hi hi"
// doesn't spam the customer with menus.
const WELCOME_COOLDOWN_MS = 60 * 1000;

// Prefix we use for the category list rows / button ids so we can recognise a
// category selection coming back through the webhook.
const CATEGORY_ID_PREFIX = 'cat_';

function isGreeting(text) {
  if (!text) return false;
  return GREETING_RE.test(String(text).trim());
}

// Persist an outbound bot message + broadcast it to the panel so agents see
// exactly what the automation sent.
async function recordOutbound(contact, { wamid, type, text, mediaUrl, mediaFilename, caption, templateData, templateName }) {
  const seq = await redis.nextSeq();
  const msg = await Message.create({
    contact: contact._id,
    waId: contact.waId,
    direction: 'outbound',
    wamid: wamid || null,
    type: type || 'text',
    text: text || '',
    mediaUrl: mediaUrl || '',
    mediaFilename: mediaFilename || '',
    caption: caption || '',
    templateName: templateName || '',
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

/**
 * Send the welcome message with a menu of active categories.
 *
 * - 1 to 3 categories -> reply buttons (each button = one category).
 * - 4 to 10 categories -> a list message ("View options" -> sectioned menu).
 *
 * Returns true if a menu was actually sent.
 */
async function sendWelcomeMenu(contact) {
  const cats = await Category.find({ active: true }).sort({ sortOrder: 1, name: 1 }).lean();
  if (!cats.length) {
    // No categories configured yet - send a friendly fallback so the customer
    // isn't left hanging.
    const r = await meta.sendText(
      contact.waId,
      'Hi! 👋 Thanks for reaching out to Nexovent Labs. Our team will get back to you shortly.'
    );
    await recordOutbound(contact, { wamid: r?.messages?.[0]?.id, type: 'text', text: 'Welcome (no categories configured).' });
    return false;
  }

  const bodyText =
    'Welcome to *Nexovent Labs* 🚀\n\nAutomate. Engage. Grow. Pick what you are interested in and we will share a quick demo.';
  const footerText = 'Nexovent Labs · WhatsApp Automation';

  if (cats.length <= 3) {
    // Reply-buttons menu (native WhatsApp buttons, max 3).
    const action = {
      buttons: cats.map((c) => ({
        type: 'reply',
        reply: { id: `${CATEGORY_ID_PREFIX}${c._id}`, title: (c.name || 'Option').slice(0, 20) },
      })),
    };
    const r = await meta.sendInteractive(contact.waId, {
      kind: 'button',
      header: { type: 'text', text: 'Nexovent Labs' },
      body: bodyText,
      footer: footerText,
      action,
    });
    await recordOutbound(contact, {
      wamid: r?.messages?.[0]?.id,
      type: 'interactive',
      text: bodyText,
    });
    return true;
  }

  // List menu (4-10 categories).
  const rows = cats.map((c) => ({
    id: `${CATEGORY_ID_PREFIX}${c._id}`,
    title: c.name,
    description: (c.description || '').slice(0, 72),
  }));
  const r = await meta.sendInteractiveList(contact.waId, {
    header: { type: 'text', text: 'Nexovent Labs' },
    body: bodyText,
    footer: footerText,
    buttonText: 'View services',
    rows,
  });
  await recordOutbound(contact, {
    wamid: r?.messages?.[0]?.id,
    type: 'interactive',
    text: bodyText,
  });
  return true;
}

/**
 * Send a single category's promo message: IMAGE header + promotional body +
 * a "DEMO" CTA URL button. Falls back gracefully when no image / no URL is set.
 */
async function sendCategoryPromo(contact, category) {
  const headerImageUrl = category.headerImageUrl || category.logoUrl || '';
  const bodyText = category.bodyContent || `Here's more about *${category.name}*.`;
  const footerText = 'Nexovent Labs';
  const ctaText = (category.ctaText || 'DEMO').slice(0, 20);
  const ctaUrl = category.ctaUrl || '';

  const templateData = {
    header: headerImageUrl ? { type: 'IMAGE', mediaUrl: headerImageUrl } : { type: 'NONE' },
    body: bodyText,
    footer: footerText,
    buttons: ctaUrl ? [{ type: 'URL', text: ctaText, url: ctaUrl }] : [],
  };

  // Pre-upload the header image to Meta so we can use it as an interactive
  // cta_url header via {link} (Meta requires link, not id, for cta_url headers).
  if (ctaUrl && headerImageUrl) {
    try {
      const r = await meta.sendInteractive(contact.waId, {
        kind: 'cta_url',
        header: { type: 'image', link: headerImageUrl },
        body: bodyText,
        footer: footerText,
        action: { name: 'cta_url', parameters: { display_text: ctaText, url: ctaUrl } },
      });
      return recordOutbound(contact, {
        wamid: r?.messages?.[0]?.id,
        type: 'image',
        mediaUrl: headerImageUrl,
        text: bodyText,
        caption: bodyText,
        templateName: category.templateName || '',
        templateData,
      });
    } catch (e) {
      console.warn('[botService] cta_url promo failed, falling back:', e.response?.data?.error?.message || e.message);
    }
  }

  // Fallback: image + caption (with the link inlined) OR plain text.
  const inlineText = ctaUrl ? `${bodyText}\n\n🔗 ${ctaText}: ${ctaUrl}` : bodyText;
  if (headerImageUrl) {
    let mediaRef = { link: headerImageUrl };
    try {
      const { buffer, mime } = await meta.fetchUrlToBuffer(headerImageUrl);
      const finalMime = mime && mime !== 'application/octet-stream' ? mime : 'image/jpeg';
      const upl = await meta.uploadMediaToMeta({
        buffer,
        mime: finalMime,
        filename: headerImageUrl.split('/').pop()?.split('?')[0] || 'promo.jpg',
      });
      mediaRef = { id: upl.id };
    } catch (e) {
      console.warn('[botService] promo media pre-upload failed, using link:', e.message);
    }
    const r = await meta.sendMedia(contact.waId, 'image', mediaRef, inlineText);
    return recordOutbound(contact, {
      wamid: r?.messages?.[0]?.id,
      type: 'image',
      mediaUrl: headerImageUrl,
      text: inlineText,
      caption: inlineText,
      templateName: category.templateName || '',
      templateData,
    });
  }

  const r = await meta.sendText(contact.waId, inlineText);
  return recordOutbound(contact, {
    wamid: r?.messages?.[0]?.id,
    type: 'text',
    text: inlineText,
    templateName: category.templateName || '',
    templateData,
  });
}

// Stamp the chosen category on the contact (+ history) so the panel/admin can
// see what the lead is interested in.
async function markCategoryChosen(contact, category) {
  contact.selectedCategory = category._id;
  contact.selectedCategoryName = category.name;
  contact.selectedCategoryAt = new Date();
  contact.categoryHistory = contact.categoryHistory || [];
  contact.categoryHistory.push({ category: category._id, name: category.name });
  await contact.save();
  emit('contact:upsert', contact);
}

// Resolve a category from an interactive reply id (button_reply / list_reply).
async function resolveCategoryFromReplyId(replyId) {
  if (!replyId || !String(replyId).startsWith(CATEGORY_ID_PREFIX)) return null;
  const id = String(replyId).slice(CATEGORY_ID_PREFIX.length);
  try {
    return await Category.findById(id);
  } catch {
    return null;
  }
}

module.exports = {
  isGreeting,
  sendWelcomeMenu,
  sendCategoryPromo,
  markCategoryChosen,
  resolveCategoryFromReplyId,
  recordOutbound,
  CATEGORY_ID_PREFIX,
  WELCOME_COOLDOWN_MS,
};
