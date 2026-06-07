const Setting = require("../models/Setting");
const flowImages = require("./flowImages");
const flowService = require("./flowService");
const meta = require("./metaService");
const redis = require("./redisService");
const Message = require("../models/Message");
const { emit } = require("./socketService");
const { toJpgUrl } = require("./imageBase64");

// ---- Config ---------------------------------------------------------------
// Delay after a service pick before we send the Interested / Not Interested
// prompt. Editable via Setting key (minutes) but defaults to ~1 second now.
const DELAY_KEY = "followup_delay_minutes";
const DEFAULT_DELAY_MIN = 1 / 60; // ≈ 1 second

// Editable copy + the call number used in the Interested / Not Interested replies.
const KEYS = {
  callNumber: "followup_call_number",
  promptBody: "followup_prompt_body",
  interestedBody: "followup_interested_body",
  notInterestedBody: "followup_not_interested_body",
  callCtaText: "followup_call_cta",
  demoCTAUrl: "followup_demo_url",
  demoCTAText: "followup_demo_cta_text",
  notInterestedCtaText: "followup_not_interested_cta",
};

const DEFAULTS = {
  callNumber: "918106811285",
  promptBody:
    "Did our service catch your interest? 👀\n\nLet us know and our team will help you get started.",
  interestedBody:
    "🎉 Awesome! Our team will contact you shortly to walk you through everything and get you started.\n\nTap below to book a free demo and see it in action!",
  notInterestedBody:
    "No problem at all 🙏\n\nWhenever you decide to transform your business into a strong *digital presence*, we are just one tap away. Save our number and call us anytime.",
  callCtaText: "Call Us",
  demoCTAUrl: "",
  demoCTAText: "Book a Demo",
  notInterestedCtaText: "Our Services",
};

// Button ids for the follow-up reply buttons.
const INTERESTED_ID = "lead_interested";
const NOT_INTERESTED_ID = "lead_not_interested";

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
  out.promptHeader = await flowImages.getUrl("followup_header");
  out.interestedHeader = await flowImages.getUrl("interested_header");
  out.notInterestedHeader = await flowImages.getUrl("not_interested_header");
  return out;
}

async function setConfig(patch = {}) {
  for (const [k, key] of Object.entries(KEYS)) {
    if (patch[k] !== undefined) await Setting.put(key, String(patch[k]));
  }
  if (patch.delayMinutes !== undefined) {
    await Setting.put(
      DELAY_KEY,
      Number(patch.delayMinutes) || DEFAULT_DELAY_MIN,
    );
  }
  return getConfig();
}

// Record an outbound bot message into the panel.
async function record(
  contact,
  { wamid, type, text, mediaUrl, caption, templateData },
) {
  const seq = await redis.nextSeq();
  const msg = await Message.create({
    contact: contact._id,
    waId: contact.waId,
    direction: "outbound",
    wamid: wamid || null,
    type: type || "text",
    text: text || "",
    mediaUrl: mediaUrl || "",
    caption: caption || "",
    ...(templateData ? { templateData } : {}),
    status: "sent",
    seq,
  });
  contact.lastMessageAt = new Date();
  contact.lastMessagePreview = caption || text || `[${type || "text"}]`;
  await contact.save();
  emit("message:new", msg);
  emit("contact:upsert", contact);
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
  const headerUrl = cfg.promptHeader ? toJpgUrl(cfg.promptHeader) : "";
  const action = {
    buttons: [
      { type: "reply", reply: { id: INTERESTED_ID, title: "Interested" } },
      {
        type: "reply",
        reply: { id: NOT_INTERESTED_ID, title: "Not Interested" },
      },
    ],
  };
  const header = headerUrl
    ? { type: "image", link: headerUrl }
    : { type: "text", text: "Nexovent Labs" };
  const r = await meta.sendInteractive(contact.waId, {
    kind: "button",
    header,
    body: cfg.promptBody,
    footer: "Nexovent Labs",
    action,
  });
  await record(contact, {
    wamid: r?.messages?.[0]?.id,
    type: headerUrl ? "image" : "interactive",
    mediaUrl: headerUrl || "",
    text: cfg.promptBody,
    caption: headerUrl ? cfg.promptBody : "",
  });
}

// Send the branched reply after the customer taps Interested / Not Interested.
// Interested:     image header + body + Demo URL CTA button (per-template or global).
// Not Interested: image header + body + "Our Services" button that opens the flow.
// `demoUrlOverride` — per-template demo URL (from the Interested button's demoUrl
// field). If provided it takes priority over the global admin config demoCTAUrl.
async function sendLeadReply(contact, interested, demoUrlOverride = null) {
  const cfg = await getConfig();
  const body = interested ? cfg.interestedBody : cfg.notInterestedBody;
  const headerUrlRaw = interested
    ? cfg.interestedHeader
    : cfg.notInterestedHeader;
  const headerUrl = headerUrlRaw ? toJpgUrl(headerUrlRaw) : "";

  // ── INTERESTED path: image header + body + Demo URL CTA ──────────────────
  if (interested) {
    const ctaUrl = (demoUrlOverride || cfg.demoCTAUrl || "").trim();
    const ctaText = (cfg.demoCTAText || "Book a Demo").slice(0, 20);

    const templateData = {
      header: headerUrl
        ? { type: "IMAGE", mediaUrl: headerUrl }
        : { type: "NONE" },
      body,
      footer: "Nexovent Labs",
      buttons: ctaUrl ? [{ type: "URL", text: ctaText, url: ctaUrl }] : [],
    };

    if (ctaUrl) {
      try {
        const header = headerUrl
          ? { type: "image", link: headerUrl }
          : { type: "text", text: "Nexovent Labs" };
        const r = await meta.sendInteractive(contact.waId, {
          kind: "cta_url",
          header,
          body,
          footer: "Nexovent Labs",
          action: {
            name: "cta_url",
            parameters: { display_text: ctaText, url: ctaUrl },
          },
        });
        return record(contact, {
          wamid: r?.messages?.[0]?.id,
          type: headerUrl ? "image" : "text",
          mediaUrl: headerUrl || "",
          text: body,
          caption: body,
          templateData,
        });
      } catch (e) {
        console.warn(
          "[followUp] interested cta_url failed, falling back:",
          e.response?.data?.error?.message || e.message,
        );
      }
    }

    // Fallback: inline the URL in the text
    const inline = ctaUrl ? `${body}\n\n🔗 ${ctaText}: ${ctaUrl}` : body;
    return sendMediaOrText(contact, headerUrl, inline, templateData);
  }

  // ── NOT INTERESTED path: image header + body + "Our Services" flow button ─
  const flowCtaText = (cfg.notInterestedCtaText || "Our Services").slice(0, 30);
  const headerOverride = headerUrl ? { type: "image", link: headerUrl } : null;

  try {
    const flowResp = await flowService.sendCategoryFlow(contact.waId, {
      body,
      footer: "Nexovent Labs",
      cta: flowCtaText,
      ...(headerOverride ? { headerOverride } : {}),
    });
    if (flowResp) {
      return record(contact, {
        wamid: flowResp?.messages?.[0]?.id,
        type: headerUrl ? "image" : "interactive",
        mediaUrl: headerUrl || "",
        text: body,
        caption: headerUrl ? body : "",
        templateData: {
          header: headerUrl
            ? { type: "IMAGE", mediaUrl: headerUrl }
            : { type: "NONE" },
          body,
          footer: "Nexovent Labs",
          buttons: [{ type: "QUICK_REPLY", text: flowCtaText }],
        },
      });
    }
  } catch (e) {
    console.warn(
      "[followUp] not-interested flow failed, falling back to call CTA:",
      e.response?.data?.error?.message || e.message,
    );
  }

  // Fallback: call CTA (if no flow is configured or flow failed)
  const callNumber = String(cfg.callNumber || "").replace(/[^\d+]/g, "");
  const callCtaText = (cfg.callCtaText || "Call Us").slice(0, 20);
  const ctaUrl = callNumber
    ? `tel:${callNumber.startsWith("+") ? callNumber : "+" + callNumber}`
    : "";

  const templateData = {
    header: headerUrl
      ? { type: "IMAGE", mediaUrl: headerUrl }
      : { type: "NONE" },
    body,
    footer: "Nexovent Labs",
    buttons: ctaUrl ? [{ type: "URL", text: callCtaText, url: ctaUrl }] : [],
  };

  if (ctaUrl) {
    try {
      const header = headerUrl
        ? { type: "image", link: headerUrl }
        : { type: "text", text: "Nexovent Labs" };
      const r = await meta.sendInteractive(contact.waId, {
        kind: "cta_url",
        header,
        body,
        footer: "Nexovent Labs",
        action: {
          name: "cta_url",
          parameters: { display_text: callCtaText, url: ctaUrl },
        },
      });
      return record(contact, {
        wamid: r?.messages?.[0]?.id,
        type: headerUrl ? "image" : "text",
        mediaUrl: headerUrl || "",
        text: body,
        caption: body,
        templateData,
      });
    } catch (e) {
      console.warn(
        "[followUp] not-interested cta_url failed, falling back:",
        e.response?.data?.error?.message || e.message,
      );
    }
  }

  const inline = callNumber
    ? `${body}\n\n📞 ${callCtaText}: ${callNumber}`
    : body;
  return sendMediaOrText(contact, headerUrl, inline, templateData);
}

// Helper: send an image message with caption, or plain text if no image.
async function sendMediaOrText(contact, headerUrl, text, templateData) {
  if (headerUrl) {
    let mediaRef = { link: headerUrl };
    try {
      const { buffer } = await meta.fetchUrlToBuffer(headerUrl);
      const upl = await meta.uploadMediaToMeta({
        buffer,
        mime: "image/jpeg",
        filename: "lead.jpg",
      });
      mediaRef = { id: upl.id };
    } catch {
      /* use link */
    }
    const r = await meta.sendMedia(contact.waId, "image", mediaRef, text);
    return record(contact, {
      wamid: r?.messages?.[0]?.id,
      type: "image",
      mediaUrl: headerUrl,
      text,
      caption: text,
      templateData,
    });
  }
  const r = await meta.sendText(contact.waId, text);
  return record(contact, {
    wamid: r?.messages?.[0]?.id,
    type: "text",
    text,
    templateData,
  });
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
