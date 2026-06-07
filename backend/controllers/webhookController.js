const Contact = require("../models/Contact");
const Message = require("../models/Message");
const Template = require("../models/Template");
const meta = require("../services/metaService");
const { emit } = require("../services/socketService");
const { cloudinary } = require("../config/cloudinary");
const metaErrors = require("../utils/metaErrors");
const redis = require("../services/redisService");
const bot = require("../services/botService");
const followUp = require("../services/followUpService");

exports.verify = (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === process.env.META_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
};

exports.receive = async (req, res) => {
  res.sendStatus(200); // always ack quickly
  try {
    const body = req.body;
    console.log("[webhook] hit", JSON.stringify(body).slice(0, 600));
    if (body.object !== "whatsapp_business_account") {
      console.log("[webhook] ignored - object:", body.object);
      return;
    }
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const field = change.field;
        const value = change.value || {};
        console.log("[webhook] field:", field);
        if (field === "messages") {
          await handleMessagesEvent(value);
        } else if (field === "message_template_status_update") {
          await handleTemplateStatus(value);
        }
      }
    }
  } catch (e) {
    console.error("[webhook] error", e.message);
  }
};

// Helper: log a Meta API error with full context so we can diagnose issues.
function logMetaError(prefix, e) {
  const metaErr = e.response?.data?.error;
  if (metaErr) {
    console.warn(
      `${prefix} -`,
      `code=${metaErr.code} subcode=${metaErr.error_subcode} type=${metaErr.type}`,
      "\n  message:",
      metaErr.message,
      "\n  details:",
      metaErr.error_data?.details || "(none)",
      "\n  trace:",
      metaErr.fbtrace_id,
    );
  } else {
    console.warn(`${prefix} (no Meta error):`, e.message);
  }
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
        if (s.status === "failed" && s.errors) {
          payload.failureSummary = metaErrors.summarize(s.errors);
        }
        emit("message:update", payload);
      }

      // Keep campaign recipient status in sync (matched by the wamid we stored
      // when sending the welcome template).
      try {
        const CampaignContact = require("../models/CampaignContact");
        const cc = await CampaignContact.findOne({ lastWamid: s.id });
        if (cc) {
          if (s.status === "failed" && s.errors) {
            const code = s.errors[0]?.code;
            const errMsg = s.errors[0]?.message || s.errors[0]?.title || "";
            const notWa =
              code === 131026 ||
              code === 131056 ||
              /not.*whatsapp|invalid.*recipient|recipient.*not.*reachable|blocked/i.test(
                errMsg,
              );
            // 131049 = per-user marketing cap — not permanent, auto-retry after 24h
            if (code === 131049) {
              cc.lastStatus = "rate_limited";
              cc.lastError =
                "Meta per-user marketing limit — auto-retry in 24 hours.";
              cc.retryAfter = new Date(Date.now() + 24 * 60 * 60 * 1000);
            } else if (notWa) {
              cc.lastStatus = "not_whatsapp";
              cc.lastError = metaErrors.summarize(s.errors)?.detail || errMsg;
            } else {
              cc.lastStatus = "failed";
              cc.lastError = metaErrors.summarize(s.errors)?.detail || errMsg;
            }
          } else if (["sent", "delivered", "read"].includes(s.status)) {
            cc.lastStatus = s.status;
            cc.lastError = "";
          }
          await cc.save();
          emit("campaign:update", cc);
        }
      } catch (e) {
        console.error("[status->campaign]", e.message);
      }
    }
  }

  // Incoming messages
  if (value.messages) {
    const contactsArr = value.contacts || [];
    for (const m of value.messages) {
      const from = m.from; // E.164 without +
      const profile = contactsArr.find((c) => c.wa_id === from)?.profile || {};

      let contact = await Contact.findOne({ waId: from });
      if (!contact) {
        contact = await Contact.create({
          waId: from,
          profileName: profile.name || "",
          name: profile.name || "",
        });
      } else if (profile.name && contact.profileName !== profile.name) {
        // Keep the WhatsApp profile name fresh (it can change over time).
        contact.profileName = profile.name;
      }

      // Mirror the captured WhatsApp name onto the campaign contact (if this
      // number came from a campaign) so the Campaign list shows the real name.
      if (profile.name) {
        (async () => {
          try {
            const CampaignContact = require("../models/CampaignContact");
            const cc = await CampaignContact.findOne({ waId: from });
            if (cc && cc.name !== profile.name) {
              cc.name = profile.name;
              await cc.save();
              emit("campaign:update", cc);
            }
          } catch (e) {
            /* non-fatal */
          }
        })();
      }

      // Use Meta's timestamp (Unix seconds) so panel order matches WhatsApp exactly,
      // not the time our webhook happened to be processed.
      const msgTime = m.timestamp
        ? new Date(Number(m.timestamp) * 1000)
        : new Date();
      contact.lastCustomerMessageAt = msgTime;
      contact.lastMessageAt = msgTime;
      contact.unreadCount = (contact.unreadCount || 0) + 1;
      contact.typing = false;

      // Click-to-WhatsApp Ads: Meta attaches a `referral` object to the FIRST
      // message after a user taps a Facebook/Instagram ad that links to WhatsApp.
      // Stamp the contact's source so the panel can show a 72h window instead of 24h.
      if (m.referral && !contact.referral?.capturedAt) {
        const ref = m.referral;
        const isInstagram = /instagram\.com/i.test(ref.source_url || "");
        contact.source = isInstagram ? "instagram_ad" : "facebook_ad";
        contact.referral = {
          source_url: ref.source_url || "",
          source_id: ref.source_id || "",
          source_type: ref.source_type || "",
          headline: ref.headline || "",
          body: ref.body || "",
          ctwa_clid: ref.ctwa_clid || "",
          capturedAt: msgTime,
        };
        console.log(
          `[ctwa] contact ${from} acquired via ${contact.source} (ad: ${ref.source_id || "?"})`,
        );
      }

      // Redis-backed monotonic sequence - tiebreaks rapid messages that share a 1s timestamp.
      const seq = await redis.nextSeq();

      // Handle message by type
      const base = {
        contact: contact._id,
        waId: from,
        direction: "inbound",
        wamid: m.id,
        status: "delivered",
        raw: m,
        createdAt: msgTime,
        seq,
      };

      if (m.context?.id) base.replyToWamid = m.context.id;

      let saved = null;
      try {
        if (m.type === "text") {
          const bodyText = m.text?.body || "";
          saved = await Message.create({
            ...base,
            type: "text",
            text: bodyText,
          });
          contact.lastMessagePreview = bodyText.slice(0, 100);

          // Auto-welcome: when the customer greets us ("hi", "hello", "menu",
          // "demo"...), reply with the category menu. Throttled so a burst of
          // greetings doesn't spam multiple menus. Runs against a freshly
          // loaded contact instance so it never races the main-flow save below
          // (which would trigger a Mongoose ParallelSaveError).
          if (bot.isGreeting(bodyText)) {
            const lastWelcome = contact.welcomeSentAt
              ? contact.welcomeSentAt.getTime()
              : 0;
            if (Date.now() - lastWelcome > bot.WELCOME_COOLDOWN_MS) {
              const contactId = contact._id;
              (async () => {
                try {
                  const fresh = await Contact.findById(contactId);
                  if (!fresh) return;
                  await bot.sendWelcomeMenu(fresh);
                  fresh.welcomeSentAt = new Date();
                  await fresh.save();
                } catch (e) {
                  console.error(
                    "[welcome]",
                    e.response?.data?.error?.message || e.message,
                  );
                }
              })();
            }
          }
        } else if (
          ["image", "video", "audio", "document", "sticker"].includes(m.type)
        ) {
          const media = m[m.type];
          const mediaId = media?.id;
          const caption = media?.caption || "";
          const mime = media?.mime_type || "";

          // Save the message doc IMMEDIATELY so (a) DB order matches arrival order, and
          // (b) we emit message:new right away. Cloudinary upload runs in the background
          // and fires message:update when done.
          saved = await Message.create({
            ...base,
            type: m.type,
            mediaUrl: "",
            mediaMime: mime,
            mediaFilename: media?.filename || "",
            caption,
          });
          contact.lastMessagePreview = caption || `[${m.type}]`;

          // Background Cloudinary upload - no await; never blocks ordering.
          if (mediaId) {
            const savedId = saved._id;
            const origName = media?.filename || "";
            (async () => {
              try {
                const info = await meta.getMediaUrl(mediaId);
                const dl = await meta.downloadMedia(info.url);
                const finalMime = mime || dl.contentType;
                // PDFs MUST be uploaded as image so Cloudinary delivers them (raw PDFs are blocked by default)
                const resourceType =
                  finalMime === "application/pdf"
                    ? "image"
                    : finalMime.startsWith("image/")
                      ? "image"
                      : finalMime.startsWith("video/") ||
                          finalMime.startsWith("audio/")
                        ? "video"
                        : "raw";
                const baseName = origName
                  ? `${Date.now()}_${origName.replace(/\s+/g, "_").replace(/\.[^.]+$/, "")}`
                  : undefined;
                const options = {
                  folder: `wati_panel/${from}`,
                  resource_type: resourceType,
                };
                if (baseName) options.public_id = baseName;
                if (finalMime === "application/pdf") options.format = "pdf";
                const up = await new Promise((resolve, reject) => {
                  const stream = cloudinary.uploader.upload_stream(
                    options,
                    (err, r) => (err ? reject(err) : resolve(r)),
                  );
                  stream.end(dl.buffer);
                });
                const updated = await Message.findByIdAndUpdate(
                  savedId,
                  { $set: { mediaUrl: up.secure_url, mediaMime: finalMime } },
                  { new: true },
                );
                if (updated) emit("message:update", updated);
              } catch (e) {
                console.error("[media download]", e.message);
                await Message.findByIdAndUpdate(savedId, {
                  $set: {
                    failureReason: JSON.stringify([
                      { title: "Media fetch failed", message: e.message },
                    ]),
                  },
                });
              }
            })();
          }
        } else if (m.type === "reaction") {
          // reaction to a message we sent
          const target = await Message.findOne({
            wamid: m.reaction?.message_id,
          });
          if (target) {
            target.reactions = target.reactions.filter(
              (r) => r.from !== "customer",
            );
            if (m.reaction.emoji)
              target.reactions.push({
                emoji: m.reaction.emoji,
                from: "customer",
                at: new Date(),
              });
            await target.save();
            emit("message:update", target);
          }
          // store nothing new in feed
          saved = null;
        } else if (m.type === "button") {
          saved = await Message.create({
            ...base,
            type: "button",
            text: m.button?.text || "",
          });
          contact.lastMessagePreview = m.button?.text || "[button]";
        } else if (m.type === "interactive") {
          const txt =
            m.interactive?.button_reply?.title ||
            m.interactive?.list_reply?.title ||
            "[interactive]";
          saved = await Message.create({
            ...base,
            type: "interactive",
            text: txt,
          });
          contact.lastMessagePreview = txt;

          // Category selection can arrive two ways:
          //   1. button_reply / list_reply id = "cat_<id>"  (plain menu)
          //   2. nfm_reply from the WhatsApp Flow, whose response_json carries
          //      { selected_category: "cat_<id>" }            (flow picker)
          let replyId =
            m.interactive?.button_reply?.id ||
            m.interactive?.list_reply?.id ||
            "";
          if (!replyId && m.interactive?.type === "nfm_reply") {
            try {
              const parsed = JSON.parse(
                m.interactive.nfm_reply?.response_json || "{}",
              );
              replyId = parsed.selected_category || "";
            } catch (e) {
              console.warn("[flow nfm_reply parse]", e.message);
            }
          }
          if (String(replyId).startsWith(bot.CATEGORY_ID_PREFIX)) {
            const contactId = contact._id;
            (async () => {
              try {
                const category = await bot.resolveCategoryFromReplyId(replyId);
                if (!category) return;
                // Reload a fresh instance so we don't double-save the same doc.
                const fresh = await Contact.findById(contactId);
                if (!fresh) return;
                await bot.markCategoryChosen(fresh, category);
                await bot.sendCategoryPromo(fresh, category);
              } catch (e) {
                console.error(
                  "[category-promo]",
                  e.response?.data?.error?.message || e.message,
                );
              }
            })();
          }

          // Lead follow-up: customer tapped Interested / Not Interested on the
          // 5-minute prompt OR on a template quick-reply button. Stamp the lead
          // response (also mirrored to callStatus so the admin dashboard shows
          // interested/not_interested) and send the branched reply.
          const tappedId = m.interactive?.button_reply?.id || "";
          const tappedTitle = (m.interactive?.button_reply?.title || "")
            .toLowerCase()
            .trim();
          const isInterestedTap =
            tappedId === followUp.INTERESTED_ID || tappedTitle === "interested";
          const isNotInterestedTap =
            tappedId === followUp.NOT_INTERESTED_ID ||
            tappedTitle === "not interested";
          if (isInterestedTap || isNotInterestedTap) {
            const interested = isInterestedTap;
            const contactId2 = contact._id;
            (async () => {
              try {
                const fresh = await Contact.findById(contactId2);
                if (!fresh) return;
                fresh.leadResponse = interested
                  ? "interested"
                  : "not_interested";
                fresh.leadResponseAt = new Date();
                const newStatus = interested ? "interested" : "not_interested";
                if (fresh.callStatus !== newStatus) {
                  fresh.callStatus = newStatus;
                  fresh.callStatusHistory.push({ status: newStatus });
                }
                await fresh.save();
                emit("contact:upsert", fresh);
                await followUp.sendLeadReply(fresh, interested);
              } catch (e) {
                console.error(
                  "[lead-response]",
                  e.response?.data?.error?.message || e.message,
                );
              }
            })();
          }

          // Auto-reply: if the tapped button belongs to a template with a configured
          // `replyText`, send that text back. Best-effort - failures don't break ingest.
          if (m.interactive?.button_reply && base.replyToWamid) {
            (async () => {
              try {
                const original = await Message.findOne({
                  wamid: base.replyToWamid,
                }).lean();
                if (!original?.templateName) return;
                const Template = require("../models/Template");
                const tpl = await Template.findOne({
                  name: original.templateName,
                }).lean();
                if (!tpl) return;
                const tappedTitle = m.interactive.button_reply.title;
                const btn = (tpl.buttons || []).find(
                  (b) => b.type === "QUICK_REPLY" && b.text === tappedTitle,
                );
                if (!btn?.replyText) return;
                const r = await meta.sendText(from, btn.replyText, m.id);
                const replyWamid = r?.messages?.[0]?.id;
                const replySeq = await redis.nextSeq();
                const reply = await Message.create({
                  contact: contact._id,
                  waId: from,
                  direction: "outbound",
                  wamid: replyWamid,
                  type: "text",
                  text: btn.replyText,
                  status: "sent",
                  seq: replySeq,
                  replyToWamid: m.id,
                });
                emit("message:new", reply);
                console.log(
                  `[auto-reply] template=${tpl.name} button="${tappedTitle}" -> ${from}`,
                );
              } catch (e) {
                console.error(
                  "[auto-reply] failed:",
                  e.response?.data?.error?.message || e.message,
                );
              }
            })();
          }
        } else {
          saved = await Message.create({
            ...base,
            type: "unsupported",
            text: `[${m.type}]`,
          });
          contact.lastMessagePreview = `[${m.type}]`;
        }
      } catch (e) {
        console.error("[save msg]", e.message);
      }

      await contact.save();
      if (saved) emit("message:new", saved);
      emit("contact:upsert", contact);

      // Auto mark as read
      try {
        await meta.markAsRead(m.id);
      } catch {}
    }
  }
}

async function handleTemplateStatus(value) {
  // value: { message_template_id, message_template_name, message_template_language, event, reason }
  const doc = await Template.findOne({
    $or: [
      { metaId: value.message_template_id },
      {
        name: value.message_template_name,
        language: value.message_template_language,
      },
    ],
  });
  if (doc) {
    doc.status = (value.event || value.status || "PENDING").toUpperCase();
    doc.rejectedReason = value.reason || "";
    doc.lastSyncedAt = new Date();
    await doc.save();
    emit("template:update", doc);
  }

  // Keep the welcome template's status (stored in Settings) in sync too.
  try {
    const Setting = require("../models/Setting");
    const welcomeName = await Setting.get(
      "welcome_template_name",
      "nexovent_welcome",
    );
    if (value.message_template_name === welcomeName) {
      await Setting.put(
        "welcome_template_status",
        (value.event || value.status || "PENDING").toUpperCase(),
      );
      if (value.message_template_id)
        await Setting.put(
          "welcome_template_meta_id",
          value.message_template_id,
        );
    }
  } catch (e) {
    console.error("[handleTemplateStatus->welcome]", e.message);
  }
}
