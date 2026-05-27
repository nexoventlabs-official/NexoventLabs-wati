const Contact = require('../models/Contact');
const Message = require('../models/Message');
const Template = require('../models/Template');
const meta = require('../services/metaService');
const { emit } = require('../services/socketService');
const metaErrors = require('../utils/metaErrors');
const { deleteByUrl } = require('../config/cloudinary');
const redis = require('../services/redisService');

// ---- Template -> free-form rendering helpers (used when 24h window is open) ----

// Substitute Meta template placeholders ({{1}}, {{2}} ...) using component params.
function substitutePlaceholders(text, params) {
  if (!text) return '';
  return text.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, idx) => {
    const p = params?.[Number(idx) - 1];
    if (!p) return '';
    if (p.type === 'text') return p.text ?? '';
    if (p.type === 'currency') return p.currency?.fallback_value ?? '';
    if (p.type === 'date_time') return p.date_time?.fallback_value ?? '';
    return p.text ?? '';
  });
}

// Find component by type, accepting both "body"/"BODY" casings used across Meta/frontend.
function findComp(components, typeLower) {
  if (!Array.isArray(components)) return null;
  return components.find(c => (c?.type || '').toLowerCase() === typeLower) || null;
}

// Resolve the final list of buttons (with placeholder values substituted).
// Returns array of { type, text, url?, phone_number? }.
function resolveButtons(tpl, components) {
  const buttonsComp = findComp(components, 'button');
  const btnParamByIndex = {};
  (buttonsComp?.parameters || []).forEach((p, i) => { btnParamByIndex[i] = p; });
  return (tpl.buttons || []).map((btn, i) => {
    const out = { type: btn.type, text: btn.text || '' };
    if (btn.type === 'URL') {
      let href = btn.url || '';
      const p = btnParamByIndex[i];
      if (p?.type === 'text') href = href.replace(/\{\{\s*\d+\s*\}\}/, p.text || '');
      out.url = href;
    } else if (btn.type === 'PHONE_NUMBER') {
      out.phone_number = btn.phone_number || '';
    }
    return out;
  });
}

// Render only the body of the template (no footer, no buttons) so it can be passed
// as the body of an interactive message or used as a media caption.
function renderBodyOnly(tpl, components) {
  const bodyParams = findComp(components, 'body')?.parameters || [];
  return substitutePlaceholders(tpl.body || '', bodyParams);
}

// Plain-text rendering with footer + buttons appended (used when interactive is not possible).
function renderTemplateText(tpl, components) {
  const body = renderBodyOnly(tpl, components);
  const lines = [];
  if (body) lines.push(body);
  if (tpl.footer) lines.push(tpl.footer);
  for (const btn of resolveButtons(tpl, components)) {
    if (btn.type === 'URL' && btn.url) lines.push(`🔗 ${btn.text || 'Link'}: ${btn.url}`);
    else if (btn.type === 'PHONE_NUMBER' && btn.phone_number) lines.push(`📞 ${btn.text || 'Call'}: ${btn.phone_number}`);
  }
  return lines.join('\n\n');
}

// Decide the header media URL to use when sending the template free-form.
// Prefers user-supplied URL from components (dynamic header media), falls back
// to the stored Cloudinary header media on the Template doc.
function resolveHeaderMediaUrl(tpl, components) {
  const headerComp = findComp(components, 'header');
  const p = headerComp?.parameters?.[0];
  if (p) {
    const kind = p.type; // image | video | document
    const obj = p[kind];
    if (obj?.link) return { url: obj.link, kind };
  }
  if (tpl.header?.mediaUrl && tpl.header.type !== 'NONE' && tpl.header.type !== 'TEXT') {
    return { url: tpl.header.mediaUrl, kind: (tpl.header.type || '').toLowerCase() };
  }
  return null;
}

exports.listMessages = async (req, res) => {
  const { contactId } = req.params;
  const { limit = 200, before } = req.query;
  const filter = { contact: contactId };
  if (before) filter.createdAt = { $lt: new Date(before) };
  // Sort by createdAt then seq so rapid messages that share a second tiebreak correctly
  const msgs = await Message.find(filter).sort({ createdAt: -1, seq: -1 }).limit(Number(limit));
  const out = msgs.reverse().map(m => {
    const o = m.toObject();
    if (o.status === 'failed' && o.failureReason) {
      o.failureSummary = metaErrors.summarize(o.failureReason);
    }
    return o;
  });
  res.json(out);
};

function isWindowOpen(contact) {
  if (!contact.lastCustomerMessageAt) return false;
  return Date.now() - contact.lastCustomerMessageAt.getTime() < 24 * 60 * 60 * 1000;
}

exports.sendText = async (req, res) => {
  try {
    const { contactId } = req.params;
    const { text, replyTo } = req.body;
    const contact = await Contact.findById(contactId);
    if (!contact) return res.status(404).json({ error: 'Not found' });
    if (!isWindowOpen(contact)) return res.status(400).json({ error: 'WINDOW_CLOSED', message: '24h session window closed. Use a template.' });
    if (!text || !text.trim()) return res.status(400).json({ error: 'Text required' });

    const resp = await meta.sendText(contact.waId, text, replyTo || undefined);
    const wamid = resp?.messages?.[0]?.id;
    const seq = await redis.nextSeq();

    const msg = await Message.create({
      contact: contact._id,
      waId: contact.waId,
      direction: 'outbound',
      wamid,
      type: 'text',
      text,
      replyToWamid: replyTo || null,
      status: 'sent',
      seq,
    });

    contact.lastMessageAt = new Date();
    contact.lastMessagePreview = text.slice(0, 100);
    await contact.save();

    emit('message:new', msg);
    emit('contact:upsert', contact);
    res.json(msg);
  } catch (e) {
    console.error('[sendText]', e.response?.data || e.message);
    res.status(500).json({ error: 'Failed', details: e.response?.data || e.message });
  }
};

exports.sendMedia = async (req, res) => {
  try {
    const { contactId } = req.params;
    const { type, url, caption, filename } = req.body; // url = cloudinary https url
    const contact = await Contact.findById(contactId);
    if (!contact) return res.status(404).json({ error: 'Not found' });
    if (!isWindowOpen(contact)) return res.status(400).json({ error: 'WINDOW_CLOSED' });
    if (!url || !type) return res.status(400).json({ error: 'url & type required' });

    // Upload bytes to Meta and send by media-id so Meta never fetches Cloudinary.
    // Fall back to link mode only if the upload fails.
    let mediaRef;
    try {
      const { buffer, mime } = await meta.fetchUrlToBuffer(url);
      const mimeOverride =
        type === 'image' ? 'image/jpeg' :
        type === 'video' ? 'video/mp4' :
        type === 'audio' ? 'audio/ogg' :
        type === 'document' ? 'application/pdf' :
        mime;
      const finalMime = mime && mime !== 'application/octet-stream' ? mime : mimeOverride;
      const upl = await meta.uploadMediaToMeta({
        buffer,
        mime: finalMime,
        filename: filename || url.split('/').pop()?.split('?')[0] || 'media',
      });
      mediaRef = { id: upl.id };
    } catch (err) {
      console.warn('[sendMedia] media-id upload failed, falling back to link:', err.message);
      mediaRef = { link: url };
    }
    const resp = await meta.sendMedia(contact.waId, type, mediaRef, caption, filename);
    const wamid = resp?.messages?.[0]?.id;
    const seq = await redis.nextSeq();

    const msg = await Message.create({
      contact: contact._id,
      waId: contact.waId,
      direction: 'outbound',
      wamid,
      type,
      mediaUrl: url,
      caption: caption || '',
      mediaFilename: filename || '',
      status: 'sent',
      seq,
    });

    contact.lastMessageAt = new Date();
    contact.lastMessagePreview = caption || `[${type}]`;
    await contact.save();

    emit('message:new', msg);
    emit('contact:upsert', contact);
    res.json(msg);
  } catch (e) {
    console.error('[sendMedia]', e.response?.data || e.message);
    res.status(500).json({ error: 'Failed', details: e.response?.data || e.message });
  }
};

exports.sendReaction = async (req, res) => {
  try {
    const { contactId } = req.params;
    const { wamid, emoji } = req.body;
    const contact = await Contact.findById(contactId);
    if (!contact) return res.status(404).json({ error: 'Not found' });
    await meta.sendReaction(contact.waId, wamid, emoji);
    const msg = await Message.findOne({ wamid });
    if (msg) {
      msg.reactions = msg.reactions.filter(r => r.from !== 'agent');
      if (emoji) msg.reactions.push({ emoji, from: 'agent', at: new Date() });
      await msg.save();
      emit('message:update', msg);
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[sendReaction]', e.response?.data || e.message);
    res.status(500).json({ error: 'Failed', details: e.response?.data || e.message });
  }
};

exports.deleteMessage = async (req, res) => {
  const { id } = req.params;
  const msg = await Message.findById(id);
  if (!msg) return res.status(404).json({ error: 'Not found' });
  // Remove media from Cloudinary if this message had any.
  // Skip when the asset belongs to a template (templateName set OR templateData.header.mediaUrl matches)
  // - it is shared across every send of that template and will 404 future sends.
  if (msg.mediaUrl && !msg.templateName && !(msg.templateData?.header?.mediaUrl)) {
    try { await deleteByUrl(msg.mediaUrl); } catch (e) { console.error('[deleteMessage cloudinary]', e.message); }
  }
  const contactId = msg.contact;
  await msg.deleteOne();
  emit('message:delete', { id, contactId });
  res.json({ ok: true });
};

exports.sendTemplate = async (req, res) => {
  try {
    const { contactId } = req.params;
    const { templateName, language, components: rawComponents, previewText } = req.body;
    const contact = await Contact.findById(contactId);
    if (!contact) return res.status(404).json({ error: 'Not found' });

    // --- Cost-saving short-circuit -------------------------------------------------
    // If the 24h customer service window is OPEN, we don't need to burn a paid
    // template send. Render the stored template (body/footer/buttons + header media)
    // as a normal text/media message. This is free within the window.
    const tpl = await Template.findOne({ name: templateName, language });
    if (tpl && isWindowOpen(contact)) {
      const buttons = resolveButtons(tpl, rawComponents || []);
      const bodyText = renderBodyOnly(tpl, rawComponents || []);
      const headerMedia = resolveHeaderMediaUrl(tpl, rawComponents || []);
      const seq = await redis.nextSeq();

      // Snapshot of the rendered template (kept on the Message doc so the panel
      // can render a real "template card" with body/footer/buttons).
      const templateData = {
        header: tpl.header?.type === 'TEXT'
          ? { type: 'TEXT', text: tpl.header?.text || '' }
          : headerMedia
            ? { type: (tpl.header?.type || headerMedia.kind.toUpperCase()), mediaUrl: headerMedia.url }
            : { type: 'NONE' },
        body: bodyText,
        footer: tpl.footer || '',
        buttons,
      };

      // Decide the best Meta send strategy:
      // - 1 URL button (with optional QUICK_REPLYs ignored)         -> cta_url interactive
      // - Only QUICK_REPLY buttons (1 to 3)                          -> button interactive
      // - Anything else (phone, mixed, >1 URL)                       -> media/text fallback
      const urlButtons = buttons.filter(b => b.type === 'URL' && b.url);
      const replyButtons = buttons.filter(b => b.type === 'QUICK_REPLY' && b.text);
      const phoneButtons = buttons.filter(b => b.type === 'PHONE_NUMBER');
      const useCta = urlButtons.length === 1 && phoneButtons.length === 0;
      const useReply = !useCta && replyButtons.length > 0 && replyButtons.length <= 3
                        && urlButtons.length === 0 && phoneButtons.length === 0;

      const mediaKind = headerMedia ? headerMedia.kind : null; // image|video|document|null
      const mediaFilename = mediaKind === 'document'
        ? (tpl.header?.mediaUrl?.split('/').pop()?.split('?')[0] || 'document')
        : undefined;

      // Build media reference. cta_url REQUIRES `link` (Meta error 131008 if id is used);
      // sendMedia fallback can use either - we pre-upload to get an id when possible.
      let mediaId = null;
      if (headerMedia) {
        try {
          const { buffer, mime } = await meta.fetchUrlToBuffer(headerMedia.url);
          const mimeOverride =
            mediaKind === 'image' ? 'image/jpeg' :
            mediaKind === 'video' ? 'video/mp4' :
            mediaKind === 'document' ? 'application/pdf' :
            mime;
          const finalMime = mime && mime !== 'application/octet-stream' ? mime : mimeOverride;
          const upl = await meta.uploadMediaToMeta({
            buffer,
            mime: finalMime,
            filename: mediaFilename || headerMedia.url.split('/').pop()?.split('?')[0] || 'media',
          });
          mediaId = upl.id;
        } catch (err) {
          console.warn('[sendTemplate free-form] media pre-upload failed:', err.message);
        }
      }

      let metaResp, msgDoc;

      if (useCta) {
        // Real WhatsApp CTA button via interactive cta_url.
        // IMPORTANT: media headers must use {link}, not {id} - Meta returns 131008 if id is used.
        const cta = urlButtons[0];
        const interactiveBody = bodyText || '\u200B';
        const action = {
          name: 'cta_url',
          parameters: { display_text: (cta.text || 'Open').slice(0, 20), url: cta.url },
        };
        let headerArg = null;
        if (mediaKind && headerMedia) {
          headerArg = { type: mediaKind, link: headerMedia.url, filename: mediaFilename };
        } else if (tpl.header?.type === 'TEXT' && tpl.header?.text) {
          headerArg = { type: 'text', text: tpl.header.text.slice(0, 60) };
        }
        try {
          metaResp = await meta.sendInteractive(contact.waId, {
            kind: 'cta_url',
            header: headerArg,
            body: interactiveBody,
            footer: tpl.footer ? tpl.footer.slice(0, 60) : undefined,
            action,
          });
          console.log('[sendTemplate free-form] cta_url ok, wamid=', metaResp?.messages?.[0]?.id);
        } catch (e) {
          console.warn('[sendTemplate free-form] cta_url failed:', JSON.stringify(e.response?.data?.error || e.message));
          metaResp = null;
        }
        if (metaResp) {
          msgDoc = await Message.create({
            contact: contact._id,
            waId: contact.waId,
            direction: 'outbound',
            wamid: metaResp?.messages?.[0]?.id,
            type: mediaKind || 'text',
            mediaUrl: headerMedia?.url || '',
            mediaFilename: mediaFilename || '',
            text: bodyText,
            caption: bodyText,
            templateName,
            templateData,
            status: 'sent',
            seq,
          });
        }
      } else if (useReply) {
        // Up to 3 native quick-reply buttons via interactive button.
        const action = {
          buttons: replyButtons.slice(0, 3).map((b, idx) => ({
            type: 'reply',
            reply: { id: `qr_${idx}_${(b.text || '').slice(0, 24)}`, title: (b.text || 'Reply').slice(0, 20) },
          })),
        };
        let headerArg = null;
        if (mediaKind && headerMedia) {
          headerArg = { type: mediaKind, link: headerMedia.url, filename: mediaFilename };
        } else if (tpl.header?.type === 'TEXT' && tpl.header?.text) {
          headerArg = { type: 'text', text: tpl.header.text.slice(0, 60) };
        }
        try {
          metaResp = await meta.sendInteractive(contact.waId, {
            kind: 'button',
            header: headerArg,
            body: bodyText || '\u200B',
            footer: tpl.footer ? tpl.footer.slice(0, 60) : undefined,
            action,
          });
          console.log('[sendTemplate free-form] reply-buttons ok, wamid=', metaResp?.messages?.[0]?.id);
        } catch (e) {
          console.warn('[sendTemplate free-form] reply-buttons failed:', JSON.stringify(e.response?.data?.error || e.message));
          metaResp = null;
        }
        if (metaResp) {
          msgDoc = await Message.create({
            contact: contact._id,
            waId: contact.waId,
            direction: 'outbound',
            wamid: metaResp?.messages?.[0]?.id,
            type: mediaKind || 'text',
            mediaUrl: headerMedia?.url || '',
            mediaFilename: mediaFilename || '',
            text: bodyText,
            caption: bodyText,
            templateName,
            templateData,
            status: 'sent',
            seq,
          });
        }
      }

      // Fallback path (no buttons OR cta_url failed OR multiple URL buttons).
      if (!msgDoc) {
        const inlinedText = renderTemplateText(tpl, rawComponents || []);
        if (mediaKind) {
          const mediaRef = mediaId ? { id: mediaId } : { link: headerMedia.url };
          metaResp = await meta.sendMedia(contact.waId, mediaKind, mediaRef, inlinedText, mediaFilename);
          msgDoc = await Message.create({
            contact: contact._id,
            waId: contact.waId,
            direction: 'outbound',
            wamid: metaResp?.messages?.[0]?.id,
            type: mediaKind,
            mediaUrl: headerMedia.url,
            mediaFilename: mediaFilename || '',
            caption: inlinedText,
            text: inlinedText,
            templateName,
            templateData,
            status: 'sent',
            seq,
          });
        } else {
          let finalText = inlinedText;
          if (tpl.header?.type === 'TEXT' && tpl.header?.text) {
            finalText = `*${tpl.header.text}*\n\n${finalText}`;
          }
          metaResp = await meta.sendText(contact.waId, finalText);
          msgDoc = await Message.create({
            contact: contact._id,
            waId: contact.waId,
            direction: 'outbound',
            wamid: metaResp?.messages?.[0]?.id,
            type: 'text',
            text: finalText,
            templateName,
            templateData,
            status: 'sent',
            seq,
          });
        }
      }

      contact.lastMessageAt = new Date();
      contact.lastMessagePreview = `[template/free] ${templateName}`;
      await contact.save();

      emit('message:new', msgDoc);
      emit('contact:upsert', contact);
      const sendMode = useCta && metaResp ? 'cta_url'
        : useReply && metaResp ? 'reply-buttons'
        : (mediaKind || 'text') + ' (fallback)';
      console.log(`[sendTemplate] window OPEN -> ${sendMode} template=${templateName}`);
      return res.json(msgDoc);
    }
    // --- end short-circuit ---------------------------------------------------------

    // Convert any URL-based media header parameters to Meta media-id parameters.
    // Meta sometimes 403s on external URLs (eg cloudinary), so we re-host the file on
    // Meta's own media endpoint and use the returned id - bulletproof.
    const components = JSON.parse(JSON.stringify(rawComponents || []));
    for (const comp of components) {
      if (comp.type !== 'header' && comp.type !== 'HEADER') continue;
      for (const p of comp.parameters || []) {
        const mediaType = p.type; // image | video | document
        const mediaObj = p[mediaType];
        if (!mediaObj || !mediaObj.link || mediaObj.id) continue;
        try {
          const { buffer, mime } = await meta.fetchUrlToBuffer(mediaObj.link);
          const mimeOverride =
            mediaType === 'image' ? 'image/jpeg' :
            mediaType === 'video' ? 'video/mp4' :
            mediaType === 'document' ? 'application/pdf' :
            mime;
          const finalMime = mime && mime !== 'application/octet-stream' ? mime : mimeOverride;
          const filename = (mediaObj.link.split('/').pop() || 'media').split('?')[0];
          const upl = await meta.uploadMediaToMeta({ buffer, mime: finalMime, filename });
          delete mediaObj.link;
          mediaObj.id = upl.id;
        } catch (e) {
          console.error('[sendTemplate] media upload to Meta failed', e.response?.data || e.message);
          throw new Error('Failed to upload header media to Meta: ' + (e.response?.data?.error?.message || e.message));
        }
      }
    }

    const resp = await meta.sendTemplateMessage(contact.waId, templateName, language, components);
    const wamid = resp?.messages?.[0]?.id;
    const seq = await redis.nextSeq();

    // Snapshot rendered template so the panel can show a "template card" in chat.
    const templateData = tpl ? {
      header: tpl.header?.type === 'TEXT'
        ? { type: 'TEXT', text: tpl.header?.text || '' }
        : tpl.header?.mediaUrl
          ? { type: tpl.header.type, mediaUrl: tpl.header.mediaUrl }
          : { type: 'NONE' },
      body: renderBodyOnly(tpl, rawComponents || []),
      footer: tpl.footer || '',
      buttons: resolveButtons(tpl, rawComponents || []),
    } : undefined;

    const msg = await Message.create({
      contact: contact._id,
      waId: contact.waId,
      direction: 'outbound',
      wamid,
      type: 'template',
      templateName,
      templateData,
      text: previewText || `[template: ${templateName}]`,
      status: 'sent',
      seq,
    });

    contact.lastMessageAt = new Date();
    contact.lastMessagePreview = `[template] ${templateName}`;
    await contact.save();

    console.log(`[sendTemplate] window CLOSED -> sent as paid Meta template name=${templateName}`);
    emit('message:new', msg);
    emit('contact:upsert', contact);
    res.json(msg);
  } catch (e) {
    console.error('[sendTemplate]', e.response?.data || e.message);
    res.status(500).json({ error: 'Failed', details: e.response?.data || e.message });
  }
};
