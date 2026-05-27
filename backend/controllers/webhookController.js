const Contact = require('../models/Contact');
const Message = require('../models/Message');
const Template = require('../models/Template');
const meta = require('../services/metaService');
const { emit } = require('../services/socketService');
const { cloudinary } = require('../config/cloudinary');
const metaErrors = require('../utils/metaErrors');
const redis = require('../services/redisService');

exports.verify = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
};

exports.receive = async (req, res) => {
  res.sendStatus(200); // always ack quickly
  try {
    const body = req.body;
    console.log('[webhook] hit', JSON.stringify(body).slice(0, 600));
    if (body.object !== 'whatsapp_business_account') {
      console.log('[webhook] ignored - object:', body.object);
      return;
    }
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const field = change.field;
        const value = change.value || {};
        console.log('[webhook] field:', field);
        if (field === 'messages') {
          await handleMessagesEvent(value);
        } else if (field === 'message_template_status_update') {
          await handleTemplateStatus(value);
        }
      }
    }
  } catch (e) {
    console.error('[webhook] error', e.message);
  }
};

// Greetings that trigger the auto-welcome. Matches common English, Tamil,
// Hindi and Spanish openers as well as typo variants (hii, hiii, halo, hlo).
const GREETING_RE = /^\s*(hi+|hello+|hey+|halo+|hlo+|hola|namaste|namaskaram|vanakkam|vanakam|good\s*(morning|afternoon|evening)|start)\b/i;

// Rich welcome message (video header + Tamil body + Register CTA) sent when a
// new user says Hi. Sent via interactive `cta_url` so the Register button is a
// real WhatsApp CTA rather than a plain link.
// The raw upload is 82 MB @ 6 min 18 s - WhatsApp Cloud API rejects videos
// over 16 MB when sent via `link`. We use Cloudinary's on-the-fly transform
// to serve a compressed version (~14.5 MB): 540 px wide, 300 kbps H.264, AAC
// audio. This keeps it safely under Meta's limit while preserving the full
// duration and playable audio.
const WELCOME_VIDEO_URL =
  'https://res.cloudinary.com/de3qyhqfg/video/upload/q_auto:low,vc_h264,ac_aac,w_540,br_300k/v1773815558/vanigan/welcome_video.mp4';
const WELCOME_REGISTER_URL = 'https://vanigan.digital/';
const WELCOME_CTA_LABEL = 'Register';

// If a user greets again within this window, don't repeat the welcome. After
// this many ms have passed we treat it as a fresh session and re-send.
const WELCOME_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
const WELCOME_BODY =
`உறுப்பினராக இணைய விருப்பம் தெரிவித்ததற்கு நன்றி🙏

💼தமிழ்நாடு வணிகர்களின் சங்கமத்தில் இணைந்தால் நீங்கள் பெறும் நன்மைகள்:

இலவச Membership ID Card 🪪

Social Media மூலம் Business Promotion 📢

வணிகர்களுடன் Networking வாய்ப்பு 🤝

GST உள்ளவர்களுக்கு Loan Assistance 💰

உங்கள் பதிவு செய்யப்பட்டவுடன் Membership செயல்முறை தொடங்கப்படும் 🚀

உறுப்பினராக இணைய கீழே உள்ள link-ஐ பயன்படுத்தவும்:`;

// Plain-text fallback used if WhatsApp rejects the interactive send (e.g.
// video link unreachable, Meta outage). We still want the customer to see
// something useful.
const WELCOME_TEXT_FALLBACK =
  `${WELCOME_BODY}\n\nRegister: ${WELCOME_REGISTER_URL}`;

// Shape we persist on every welcome Message so the agent panel renders a
// WhatsApp-style template card (video header + body + Register button),
// mirroring how a paid Meta template would look. The panel's TemplateCard
// component picks this up via `m.templateData`.
const WELCOME_TEMPLATE_NAME = 'auto_welcome_vanigan';
const WELCOME_TEMPLATE_DATA = {
  header: { type: 'VIDEO', mediaUrl: WELCOME_VIDEO_URL },
  body: WELCOME_BODY,
  buttons: [
    { type: 'URL', text: WELCOME_CTA_LABEL, url: WELCOME_REGISTER_URL },
  ],
};

// Helper: log a Meta API error with full context so we can diagnose issues.
function logMetaError(prefix, e) {
  const metaErr = e.response?.data?.error;
  if (metaErr) {
    console.warn(
      `${prefix} -`,
      `code=${metaErr.code} subcode=${metaErr.error_subcode} type=${metaErr.type}`,
      '\n  message:', metaErr.message,
      '\n  details:', metaErr.error_data?.details || '(none)',
      '\n  trace:', metaErr.fbtrace_id
    );
  } else {
    console.warn(`${prefix} (no Meta error):`, e.message);
  }
}

// Sends the rich welcome message. Preferred path is ONE native interactive
// message with:
//   header.type = video  (Cloudinary-compressed MP4, ~14.5 MB, H.264 / AAC)
//   body.text   = Tamil welcome copy
//   action      = cta_url button labelled "Register" → vanigan.digital
//
// Meta occasionally rejects video headers on interactive.cta_url (even with a
// compliant MP4) because it re-fetches the media and validates it. To keep
// delivery reliable we fall back through two layers:
//   1. single interactive (video header + body + Register CTA)
//   2. split:  standalone video message  +  interactive(text body + CTA)
//   3. plain text (body + URL) if everything else explodes
//
// Returns an array of saved Message docs (for socket emits).
async function sendWelcomeMessage(contact) {
  const to = contact.waId;
  const out = [];

  // ---- (1) Preferred: single interactive cta_url WITH video header --------
  try {
    const resp = await meta.sendInteractive(to, {
      kind: 'cta_url',
      header: { type: 'video', link: WELCOME_VIDEO_URL },
      body: WELCOME_BODY,
      action: {
        name: 'cta_url',
        parameters: {
          display_text: WELCOME_CTA_LABEL.slice(0, 20),
          url: WELCOME_REGISTER_URL,
        },
      },
    });
    const wamid = resp?.messages?.[0]?.id;
    const seq = await redis.nextSeq();
    // Stored as type: 'video' with the body text in caption so the agent
    // panel renders: inline video preview + caption text, matching the
    // customer-facing view. wamid still tracks the single real WhatsApp
    // message so delivery/read receipts flow back correctly.
    const msg = await Message.create({
      contact: contact._id,
      waId: to,
      direction: 'outbound',
      wamid,
      type: 'video',
      mediaUrl: WELCOME_VIDEO_URL,
      mediaMime: 'video/mp4',
      caption: WELCOME_BODY,
      text: WELCOME_BODY,
      // Template card rendering in the panel (video header + body + Register
      // button), same shape used by real Meta templates.
      templateName: WELCOME_TEMPLATE_NAME,
      templateData: WELCOME_TEMPLATE_DATA,
      status: 'sent',
      seq,
    });
    out.push(msg);
    console.log('[auto-welcome] single interactive(video header) sent to', to, 'wamid=', wamid);
    return out;
  } catch (e) {
    logMetaError('[auto-welcome] single interactive with video header failed', e);
    console.warn('[auto-welcome] falling back to split 2-message send');
  }

  // ---- (2) Fallback: video message + interactive (no header) -------------
  try {
    const resp = await meta.sendMedia(to, 'video', { link: WELCOME_VIDEO_URL });
    const wamid = resp?.messages?.[0]?.id;
    const seq = await redis.nextSeq();
    // Split path: video + interactive are ONE logical welcome card in the
    // panel. We put the full template card on the video Message so the card
    // appears at the video position and the later interactive reply renders
    // as a plain bubble.
    const videoMsg = await Message.create({
      contact: contact._id,
      waId: to,
      direction: 'outbound',
      wamid,
      type: 'video',
      mediaUrl: WELCOME_VIDEO_URL,
      mediaMime: 'video/mp4',
      caption: WELCOME_BODY,
      templateName: WELCOME_TEMPLATE_NAME,
      templateData: WELCOME_TEMPLATE_DATA,
      status: 'sent',
      seq,
    });
    out.push(videoMsg);
    console.log('[auto-welcome] split: video sent to', to, 'wamid=', wamid);
  } catch (e) {
    logMetaError('[auto-welcome] split: video send failed', e);
    // Keep going - we still want to deliver the Register CTA even if the
    // video couldn't be fetched (e.g. Meta can't reach Cloudinary right now).
  }

  try {
    const resp = await meta.sendInteractive(to, {
      kind: 'cta_url',
      body: WELCOME_BODY,
      action: {
        name: 'cta_url',
        parameters: {
          display_text: WELCOME_CTA_LABEL.slice(0, 20),
          url: WELCOME_REGISTER_URL,
        },
      },
    });
    // In split mode the video Message (created above) already carries the
    // full template card (video + body + Register button) in the panel. We
    // deliberately do NOT persist a second Message doc here - surfacing the
    // same CTA twice would be redundant. Trade-off: we lose the ability to
    // track delivery/read receipts for this specific Meta wamid, but this is
    // only a fallback path and the user experience is cleaner.
    const wamid = resp?.messages?.[0]?.id;
    console.log('[auto-welcome] split: interactive cta_url sent to', to, 'wamid=', wamid);
    return out;
  } catch (e) {
    logMetaError('[auto-welcome] split: interactive cta_url failed', e);
  }

  // ---- (3) Last-resort plain text ----------------------------------------
  try {
    const resp = await meta.sendText(to, WELCOME_TEXT_FALLBACK);
    const wamid = resp?.messages?.[0]?.id;
    const seq = await redis.nextSeq();
    const textMsg = await Message.create({
      contact: contact._id,
      waId: to,
      direction: 'outbound',
      wamid,
      type: 'text',
      text: WELCOME_TEXT_FALLBACK,
      status: 'sent',
      seq,
    });
    out.push(textMsg);
    console.log('[auto-welcome] text fallback sent to', to);
  } catch (e) {
    logMetaError('[auto-welcome] text fallback also failed', e);
  }
  return out;
}

async function handleMessagesEvent(value) {
  // Statuses (delivered/read/sent/failed)
  if (value.statuses) {
    for (const s of value.statuses) {
      const msg = await Message.findOne({ wamid: s.id });
      if (msg) {
        msg.status = s.status;
        if (s.errors) msg.failureReason = JSON.stringify(s.errors);
        await msg.save();
        const payload = msg.toObject();
        if (s.status === 'failed' && s.errors) {
          payload.failureSummary = metaErrors.summarize(s.errors);
        }
        emit('message:update', payload);
      }
    }
  }

  // Incoming messages
  if (value.messages) {
    const contactsArr = value.contacts || [];
    for (const m of value.messages) {
      const from = m.from; // E.164 without +
      const profile = contactsArr.find(c => c.wa_id === from)?.profile || {};

      let contact = await Contact.findOne({ waId: from });
      if (!contact) {
        contact = await Contact.create({
          waId: from,
          profileName: profile.name || '',
          name: profile.name || '',
        });
      } else if (profile.name && !contact.profileName) {
        contact.profileName = profile.name;
      }

      // Use Meta's timestamp (Unix seconds) so panel order matches WhatsApp exactly,
      // not the time our webhook happened to be processed.
      const msgTime = m.timestamp ? new Date(Number(m.timestamp) * 1000) : new Date();
      contact.lastCustomerMessageAt = msgTime;
      contact.lastMessageAt = msgTime;
      contact.unreadCount = (contact.unreadCount || 0) + 1;
      contact.typing = false;

      // Click-to-WhatsApp Ads: Meta attaches a `referral` object to the FIRST
      // message after a user taps a Facebook/Instagram ad that links to WhatsApp.
      // Stamp the contact's source so the panel can show a 72h window instead of 24h.
      if (m.referral && !contact.referral?.capturedAt) {
        const ref = m.referral;
        const isInstagram = /instagram\.com/i.test(ref.source_url || '');
        contact.source = isInstagram ? 'instagram_ad' : 'facebook_ad';
        contact.referral = {
          source_url: ref.source_url || '',
          source_id: ref.source_id || '',
          source_type: ref.source_type || '',
          headline: ref.headline || '',
          body: ref.body || '',
          ctwa_clid: ref.ctwa_clid || '',
          capturedAt: msgTime,
        };
        console.log(`[ctwa] contact ${from} acquired via ${contact.source} (ad: ${ref.source_id || '?'})`);
      }

      // Redis-backed monotonic sequence - tiebreaks rapid messages that share a 1s timestamp.
      const seq = await redis.nextSeq();

      // Handle message by type
      const base = {
        contact: contact._id,
        waId: from,
        direction: 'inbound',
        wamid: m.id,
        status: 'delivered',
        raw: m,
        createdAt: msgTime,
        seq,
      };

      if (m.context?.id) base.replyToWamid = m.context.id;

      let saved = null;
      try {
        if (m.type === 'text') {
          const bodyText = m.text?.body || '';
          saved = await Message.create({ ...base, type: 'text', text: bodyText });
          contact.lastMessagePreview = bodyText.slice(0, 100);

          // Auto-welcome on greeting. We suppress it only if the same contact
          // received the welcome within the cooldown window (default 1h) to
          // avoid spamming customers who say "Hi" multiple times in a session.
          // After the window elapses a fresh greeting re-triggers the welcome.
          if (GREETING_RE.test(bodyText)) {
            const last = contact.welcomeSentAt ? contact.welcomeSentAt.getTime() : 0;
            const withinCooldown = last && (Date.now() - last) < WELCOME_COOLDOWN_MS;
            if (!withinCooldown) {
              const replies = await sendWelcomeMessage(contact);
              for (const r of replies) emit('message:new', r);
              if (replies.length > 0) {
                contact.lastMessageAt = new Date();
                contact.lastMessagePreview = WELCOME_BODY.slice(0, 100);
                contact.welcomeSentAt = new Date();
              }
            } else {
              const mins = Math.round((Date.now() - last) / 60000);
              console.log(`[auto-welcome] skipped - sent ${mins}m ago to ${from} (cooldown ${WELCOME_COOLDOWN_MS / 60000}m)`);
            }
          }
        } else if (['image', 'video', 'audio', 'document', 'sticker'].includes(m.type)) {
          const media = m[m.type];
          const mediaId = media?.id;
          const caption = media?.caption || '';
          const mime = media?.mime_type || '';

          // Save the message doc IMMEDIATELY so (a) DB order matches arrival order, and
          // (b) we emit message:new right away. Cloudinary upload runs in the background
          // and fires message:update when done.
          saved = await Message.create({
            ...base,
            type: m.type,
            mediaUrl: '',
            mediaMime: mime,
            mediaFilename: media?.filename || '',
            caption,
          });
          contact.lastMessagePreview = caption || `[${m.type}]`;

          // Background Cloudinary upload - no await; never blocks ordering.
          if (mediaId) {
            const savedId = saved._id;
            const origName = media?.filename || '';
            (async () => {
              try {
                const info = await meta.getMediaUrl(mediaId);
                const dl = await meta.downloadMedia(info.url);
                const finalMime = mime || dl.contentType;
                // PDFs MUST be uploaded as image so Cloudinary delivers them (raw PDFs are blocked by default)
                const resourceType =
                  finalMime === 'application/pdf' ? 'image'
                  : finalMime.startsWith('image/') ? 'image'
                  : (finalMime.startsWith('video/') || finalMime.startsWith('audio/')) ? 'video'
                  : 'raw';
                const baseName = origName
                  ? `${Date.now()}_${origName.replace(/\s+/g, '_').replace(/\.[^.]+$/, '')}`
                  : undefined;
                const options = {
                  folder: `wati_panel/${from}`,
                  resource_type: resourceType,
                };
                if (baseName) options.public_id = baseName;
                if (finalMime === 'application/pdf') options.format = 'pdf';
                const up = await new Promise((resolve, reject) => {
                  const stream = cloudinary.uploader.upload_stream(options,
                    (err, r) => err ? reject(err) : resolve(r)
                  );
                  stream.end(dl.buffer);
                });
                const updated = await Message.findByIdAndUpdate(
                  savedId,
                  { $set: { mediaUrl: up.secure_url, mediaMime: finalMime } },
                  { new: true }
                );
                if (updated) emit('message:update', updated);
              } catch (e) {
                console.error('[media download]', e.message);
                await Message.findByIdAndUpdate(savedId, { $set: { failureReason: JSON.stringify([{ title: 'Media fetch failed', message: e.message }]) } });
              }
            })();
          }
        } else if (m.type === 'reaction') {
          // reaction to a message we sent
          const target = await Message.findOne({ wamid: m.reaction?.message_id });
          if (target) {
            target.reactions = target.reactions.filter(r => r.from !== 'customer');
            if (m.reaction.emoji) target.reactions.push({ emoji: m.reaction.emoji, from: 'customer', at: new Date() });
            await target.save();
            emit('message:update', target);
          }
          // store nothing new in feed
          saved = null;
        } else if (m.type === 'button') {
          saved = await Message.create({ ...base, type: 'button', text: m.button?.text || '' });
          contact.lastMessagePreview = m.button?.text || '[button]';
        } else if (m.type === 'interactive') {
          const txt = m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || '[interactive]';
          saved = await Message.create({ ...base, type: 'interactive', text: txt });
          contact.lastMessagePreview = txt;

          // Auto-reply: if the tapped button belongs to a template with a configured
          // `replyText`, send that text back. Best-effort - failures don't break ingest.
          if (m.interactive?.button_reply && base.replyToWamid) {
            (async () => {
              try {
                const original = await Message.findOne({ wamid: base.replyToWamid }).lean();
                if (!original?.templateName) return;
                const Template = require('../models/Template');
                const tpl = await Template.findOne({ name: original.templateName }).lean();
                if (!tpl) return;
                const tappedTitle = m.interactive.button_reply.title;
                const btn = (tpl.buttons || []).find(
                  (b) => b.type === 'QUICK_REPLY' && b.text === tappedTitle
                );
                if (!btn?.replyText) return;
                const r = await meta.sendText(from, btn.replyText, m.id);
                const replyWamid = r?.messages?.[0]?.id;
                const replySeq = await redis.nextSeq();
                const reply = await Message.create({
                  contact: contact._id,
                  waId: from,
                  direction: 'outbound',
                  wamid: replyWamid,
                  type: 'text',
                  text: btn.replyText,
                  status: 'sent',
                  seq: replySeq,
                  replyToWamid: m.id,
                });
                emit('message:new', reply);
                console.log(`[auto-reply] template=${tpl.name} button="${tappedTitle}" -> ${from}`);
              } catch (e) {
                console.error('[auto-reply] failed:', e.response?.data?.error?.message || e.message);
              }
            })();
          }
        } else {
          saved = await Message.create({ ...base, type: 'unsupported', text: `[${m.type}]` });
          contact.lastMessagePreview = `[${m.type}]`;
        }
      } catch (e) {
        console.error('[save msg]', e.message);
      }

      await contact.save();
      if (saved) emit('message:new', saved);
      emit('contact:upsert', contact);

      // Auto mark as read
      try { await meta.markAsRead(m.id); } catch {}
    }
  }
}

async function handleTemplateStatus(value) {
  // value: { message_template_id, message_template_name, message_template_language, event, reason }
  const doc = await Template.findOne({
    $or: [{ metaId: value.message_template_id }, { name: value.message_template_name, language: value.message_template_language }],
  });
  if (doc) {
    doc.status = (value.event || value.status || 'PENDING').toUpperCase();
    doc.rejectedReason = value.reason || '';
    doc.lastSyncedAt = new Date();
    await doc.save();
    emit('template:update', doc);
  }
}
