const Template = require("../models/Template");
const meta = require("../services/metaService");
const { emit } = require("../services/socketService");
const { deleteByUrl } = require("../config/cloudinary");
const axios = require("axios");

// Meta WhatsApp template HEADER format -> list of accepted MIME types.
// We pick the *first* match between this list and the actual content-type
// served by Cloudinary, falling back to the first entry as a safe default.
// (See https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates)
const HEADER_MIME_BY_FORMAT = {
  IMAGE: ["image/jpeg", "image/png"],
  VIDEO: ["video/mp4", "video/3gpp"],
  DOCUMENT: ["application/pdf"],
};

// Map MIME -> filename extension that Meta will accept. Used when we have
// to rebuild the filename so the extension matches `file_type`.
const EXT_FOR_MIME = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "application/pdf": "pdf",
};

// URL-only fallback for mime detection when HEAD requests are blocked or
// the server does not advertise a useful Content-Type.
function guessMimeFromUrl(url, format) {
  const lower = (url.split("?")[0] || "").toLowerCase();
  if (format === "IMAGE") {
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  } else if (format === "VIDEO") {
    if (lower.endsWith(".mp4")) return "video/mp4";
    if (lower.endsWith(".3gp")) return "video/3gpp";
  } else if (format === "DOCUMENT") {
    if (lower.endsWith(".pdf")) return "application/pdf";
  }
  return null;
}

exports.listTemplates = async (req, res) => {
  const templates = await Template.find().sort({ updatedAt: -1 });
  res.json(templates);
};

exports.syncTemplates = async (req, res) => {
  try {
    const { data } = await meta.listTemplates();
    const items = data || [];
    const results = [];
    for (const t of items) {
      const existing = await Template.findOne({
        name: t.name,
        language: t.language,
      });
      const derived = derivedFromComponents(t.components);
      // Preserve the original Cloudinary mediaUrl - Meta returns expiring signed CDN URLs that
      // we cannot reuse for actual sending.
      if (
        existing?.header?.mediaUrl &&
        !existing.header.mediaUrl.includes("whatsapp.net")
      ) {
        derived.header = {
          ...derived.header,
          mediaUrl: existing.header.mediaUrl,
        };
      }
      // Preserve per-button replyText (we store it locally; Meta doesn't return it).
      if (existing?.buttons?.length && derived.buttons?.length) {
        derived.buttons = derived.buttons.map((b) => {
          const prior = existing.buttons.find(
            (x) => x.type === b.type && x.text === b.text,
          );
          return prior?.replyText ? { ...b, replyText: prior.replyText } : b;
        });
      }
      const doc = await Template.findOneAndUpdate(
        { name: t.name, language: t.language },
        {
          metaId: t.id,
          name: t.name,
          language: t.language,
          category: t.category,
          status: t.status,
          rejectedReason: t.rejected_reason || "",
          components: t.components,
          lastSyncedAt: new Date(),
          ...derived,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      results.push(doc);
      emit("template:update", doc);
    }
    res.json({ count: results.length, templates: results });
  } catch (e) {
    console.error("[syncTemplates]", e.response?.data || e.message);
    res
      .status(500)
      .json({ error: "Failed", details: e.response?.data || e.message });
  }
};

function derivedFromComponents(components = []) {
  const header = (components || []).find((c) => c.type === "HEADER");
  const body = (components || []).find((c) => c.type === "BODY");
  const footer = (components || []).find((c) => c.type === "FOOTER");
  const buttons = (components || []).find((c) => c.type === "BUTTONS");
  return {
    header: header
      ? {
          type: header.format || "TEXT",
          text: header.format === "TEXT" ? header.text : "",
          mediaUrl: header.example?.header_handle?.[0] || "",
        }
      : { type: "NONE" },
    body: body?.text || "",
    footer: footer?.text || "",
    buttons: (buttons?.buttons || []).map((b) => ({
      type: b.type,
      text: b.text,
      url: b.url,
      phone_number: b.phone_number,
    })),
  };
}

exports.createTemplate = async (req, res) => {
  try {
    const {
      name,
      language = "en_US",
      category = "MARKETING",
      header,
      body,
      footer,
      buttons,
    } = req.body;
    if (!name || !body)
      return res.status(400).json({ error: "name & body required" });

    const components = [];
    if (header && header.type && header.type !== "NONE") {
      if (header.type === "TEXT") {
        components.push({
          type: "HEADER",
          format: "TEXT",
          text: header.text || "",
        });
      } else {
        // IMAGE/VIDEO/DOCUMENT: Meta requires example header_handle. We pass the URL as example.
        components.push({
          type: "HEADER",
          format: header.type,
          example: { header_handle: [header.mediaUrl] },
        });
      }
    }
    components.push({ type: "BODY", text: body });
    if (footer) components.push({ type: "FOOTER", text: footer });
    if (buttons && buttons.length) {
      components.push({
        type: "BUTTONS",
        buttons: buttons.map((b) => {
          if (b.type === "URL")
            return { type: "URL", text: b.text, url: b.url };
          if (b.type === "PHONE_NUMBER")
            return {
              type: "PHONE_NUMBER",
              text: b.text,
              phone_number: b.phone_number,
            };
          return { type: "QUICK_REPLY", text: b.text };
        }),
      });
    }

    // Build the buttons array preserving local-only fields (replyText, demoUrl)
    // that are not part of the Meta template spec but are used by the bot logic.
    const savedButtons = (buttons || []).map((b) => {
      if (b.type === "URL")
        return { type: "URL", text: b.text, url: b.url };
      if (b.type === "PHONE_NUMBER")
        return { type: "PHONE_NUMBER", text: b.text, phone_number: b.phone_number };
      return {
        type: "QUICK_REPLY",
        text: b.text,
        replyText: b.replyText || "",
        demoUrl: b.demoUrl || "",
      };
    });

    // Save DRAFT first
    let doc = await Template.create({
      name,
      language,
      category,
      status: "DRAFT",
      header: header || { type: "NONE" },
      body,
      footer: footer || "",
      buttons: savedButtons,
      components,
    });
    emit("template:update", doc);
    res.json(doc);
  } catch (e) {
    console.error("[createTemplate]", e.response?.data || e.message);
    res
      .status(500)
      .json({ error: "Failed", details: e.response?.data || e.message });
  }
};

exports.submitTemplate = async (req, res) => {
  try {
    const doc = await Template.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Not found" });

    // Deep-clone components so we can swap in a Meta header_handle for media headers
    const components = JSON.parse(JSON.stringify(doc.components || []));
    const header = components.find((c) => c.type === "HEADER");
    if (header && ["IMAGE", "VIDEO", "DOCUMENT"].includes(header.format)) {
      const mediaUrl =
        doc.header?.mediaUrl || header.example?.header_handle?.[0];
      if (!mediaUrl)
        return res.status(400).json({ error: "Header media URL missing" });

      // Reject unsupported video formats early with a clear message.
      if (header.format === "VIDEO") {
        const lower = (mediaUrl.split("?")[0] || "").toLowerCase();
        if (lower.endsWith(".mov") || lower.endsWith(".avi") || lower.endsWith(".wmv") || lower.endsWith(".mkv")) {
          return res.status(400).json({
            error: "Meta only accepts MP4 or 3GP video for template headers. Please re-upload your video as an MP4 file.",
          });
        }
      }
      // Meta returns expiring whatsapp.net signed URLs that we can't re-fetch.
      // If a previous sync stored one of those (instead of the original
      // Cloudinary URL), refuse early with a clear message.
      if (
        !/^https?:\/\//i.test(mediaUrl) ||
        /whatsapp\.net|lookaside\.fbsbx\.com/i.test(mediaUrl)
      ) {
        return res.status(400).json({
          error:
            "Header media URL is not re-uploadable. Re-upload the image/video/PDF for this template, then submit again.",
        });
      }

      // Defend against the most common reason Meta's resumable upload rejects
      // a header sample: a mismatch between the declared `file_type` / file
      // extension and the actual bytes Cloudinary serves (e.g. user uploaded
      // a PNG but we hard-coded image/jpeg).
      // Strategy:
      //   1. HEAD-fetch the Cloudinary URL to read the real Content-Type.
      //   2. Fall back to the URL extension, then to a sensible default.
      //   3. Pin the filename to a safe extension that matches the mime.
      const allowed = HEADER_MIME_BY_FORMAT[header.format];
      let detectedMime = null;
      try {
        const head = await axios.head(mediaUrl, { timeout: 10000 });
        detectedMime = (head.headers["content-type"] || "")
          .split(";")[0]
          .trim()
          .toLowerCase();
      } catch (_) {
        /* best-effort; falls back below */
      }
      // Pick a mime Meta accepts for this header format.
      let fileType =
        detectedMime && allowed.includes(detectedMime)
          ? detectedMime
          : guessMimeFromUrl(mediaUrl, header.format) || allowed[0];

      // Build a Meta-safe filename. Meta forbids `/ < @ %` in filenames AND
      // expects the extension to match file_type.
      let rawName = (mediaUrl.split("/").pop() || "header").split("?")[0];
      try {
        rawName = decodeURIComponent(rawName);
      } catch {
        /* keep raw */
      }
      const safeStem =
        rawName
          .replace(/[\/<@%\s]/g, "_")
          .replace(/\.[^.]+$/, "")
          .trim() || "header";
      const fileName = `${safeStem}.${EXT_FOR_MIME[fileType] || EXT_FOR_MIME[allowed[0]]}`;

      const { header_handle } = await meta.uploadHeaderSample({
        fileUrl: mediaUrl,
        fileName,
        fileType,
      });
      header.example = { header_handle: [header_handle] };
    }

    const payload = {
      name: doc.name,
      language: doc.language,
      category: doc.category,
      components,
    };

    // Meta requires example values for any {{N}} placeholders in the body.
    // Without them the API returns "variable parameter format is incorrect".
    const bodyComp = components.find((c) => c.type === "BODY");
    if (bodyComp && /\{\{\s*\d+\s*\}\}/.test(bodyComp.text || "")) {
      const vars = [];
      let match;
      const re = /\{\{\s*(\d+)\s*\}\}/g;
      const seen = new Set();
      while ((match = re.exec(bodyComp.text)) !== null) {
        if (!seen.has(match[1])) {
          seen.add(match[1]);
          vars.push({ type: "text", text: "Customer" });
        }
      }
      if (vars.length) bodyComp.example = { body_text: [vars.map((v) => v.text)] };
    }

    let resp;
    try {
      resp = await meta.createTemplate(payload);
    } catch (e) {
      const errCode = e.response?.data?.error?.code;
      const errSub = e.response?.data?.error?.error_subcode;
      // 192xxx, 100/2388023 etc => "name already exists" - treat as success and refresh from Meta
      const msg = e.response?.data?.error?.message || "";
      const alreadyExists =
        /already exists|exists with the same name/i.test(msg) ||
        errSub === 2388024;
      if (!alreadyExists) throw e;
      console.log("[submitTemplate] template exists on Meta - syncing instead");
      // Try to find by name in Meta and pull current status
      const list = await meta.listTemplates();
      const found = (list.data || []).find(
        (t) => t.name === doc.name && t.language === doc.language,
      );
      if (!found) throw e;
      resp = { id: found.id, status: found.status };
    }

    doc.metaId = resp.id;
    doc.status = (resp.status || "PENDING").toUpperCase();
    doc.components = components;
    doc.lastSyncedAt = new Date();
    await doc.save();
    emit("template:update", doc);
    res.json(doc);
  } catch (e) {
    // Print URL+status alongside the body so Render logs make the failure
    // point obvious (header upload vs createTemplate vs other).
    const cfg = e.config || {};
    console.error("[submitTemplate]", {
      url: cfg.url,
      method: cfg.method,
      status: e.response?.status,
      data: e.response?.data,
      message: e.message,
    });
    const metaErr = e.response?.data?.error;
    const friendly =
      metaErr?.error_user_msg ||
      metaErr?.message ||
      e.message ||
      "Failed to submit template";
    res.status(500).json({
      error: friendly,
      details: e.response?.data || e.message,
    });
  }
};

exports.refreshTemplate = async (req, res) => {
  try {
    const doc = await Template.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Not found" });
    if (!doc.metaId)
      return res.status(400).json({ error: "Not submitted yet" });
    const meta_ = require("../services/metaService");
    const data = await meta_.getTemplateById(doc.metaId);
    doc.status = (data.status || doc.status).toUpperCase();
    doc.rejectedReason = data.rejected_reason || "";
    doc.lastSyncedAt = new Date();
    await doc.save();
    emit("template:update", doc);
    res.json(doc);
  } catch (e) {
    console.error("[refreshTemplate]", e.response?.data || e.message);
    res
      .status(500)
      .json({ error: "Failed", details: e.response?.data || e.message });
  }
};

// Update only the per-button auto-reply text for QUICK_REPLY buttons.
// Local-only - does NOT touch Meta (replyText isn't part of the Meta template spec).
// Body shape: { replies: { "<button text>": "<auto reply text>", ... }, demoUrls: { "<button text>": "<url>", ... } }
exports.updateButtonReplies = async (req, res) => {
  try {
    const doc = await Template.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Not found" });
    const replies = req.body?.replies || {};
    const demoUrls = req.body?.demoUrls || {};
    let touched = 0;
    doc.buttons = doc.buttons.map((b) => {
      if (b.type !== "QUICK_REPLY") return b;
      if (Object.prototype.hasOwnProperty.call(replies, b.text)) {
        const next = String(replies[b.text] || "");
        if ((b.replyText || "") !== next) touched += 1;
        b.replyText = next;
      }
      if (Object.prototype.hasOwnProperty.call(demoUrls, b.text)) {
        const next = String(demoUrls[b.text] || "");
        if ((b.demoUrl || "") !== next) touched += 1;
        b.demoUrl = next;
      }
      return b;
    });
    await doc.save();
    emit("template:update", doc);
    res.json({ ok: true, updated: touched, template: doc });
  } catch (e) {
    console.error("[updateButtonReplies]", e.message);
    res.status(500).json({ error: "Failed", details: e.message });
  }
};

// Full-stack template delete: removes from Meta (WABA), Cloudinary (header media),
// and MongoDB. Always tears down the local copy even if Meta delete fails so the
// panel doesn't keep showing a broken entry.
exports.deleteTemplate = async (req, res) => {
  try {
    const doc = await Template.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Not found" });

    const result = { meta: null, cloudinary: null, mongo: null };

    // 1) Delete from Meta (WABA). We try as long as we've ever submitted
    // (metaId OR status !== DRAFT). If it's DRAFT-only (never submitted), skip.
    const everSubmitted =
      !!doc.metaId || (doc.status && doc.status !== "DRAFT");
    if (everSubmitted) {
      try {
        await meta.deleteTemplate(doc.name);
        result.meta = "deleted";
        console.log(`[deleteTemplate] Meta deleted name=${doc.name}`);
      } catch (e) {
        const err = e.response?.data?.error;
        const code = err?.code;
        const subcode = err?.error_subcode;
        const msg = err?.message || e.message;

        const userTitle = err?.error_user_title || "";
        const userMsg = err?.error_user_msg || "";

        // "Not found / already gone" -> treat as success.
        // Meta signals this in several ways:
        //  - subcode 2593002 ("Message template not found")
        //  - error_user_title/msg mentioning template not found
        //  - plain message wording
        // We deliberately DON'T rely on code 100 alone (which also covers permission errors).
        const looksNotFound =
          subcode === 2593002 ||
          /template .*(not found|doesn'?t exist|wasn'?t found)/i.test(
            userTitle + " " + userMsg,
          ) ||
          /does not exist|not found|no template/i.test(msg);
        if (looksNotFound) {
          result.meta = "not_found_on_meta";
          console.log(
            `[deleteTemplate] Meta 'not found' for name=${doc.name} - ok`,
          );
        } else if (code === 100 && /permission/i.test(msg)) {
          // Token lacks whatsapp_business_management (delete scope). Meta returns
          // this error BEFORE it checks whether the resource exists. So if the
          // template was already deleted out-of-band (e.g. via Meta Business Suite),
          // we can't tell from this response alone. Fall back to `listTemplates`
          // (read scope, usually granted) to check whether the template is
          // actually present. If it isn't, we can safely clean up locally.
          console.warn(
            `[deleteTemplate] Meta delete forbidden for name=${doc.name}; probing list...`,
          );
          try {
            const listing = await meta.listTemplates();
            const stillThere = (listing?.data || []).some(
              (t) =>
                t.name === doc.name &&
                (!doc.language || t.language === doc.language),
            );
            if (!stillThere) {
              result.meta = "not_found_on_meta";
              console.log(
                `[deleteTemplate] confirmed name=${doc.name} absent on Meta (via list) - ok`,
              );
            } else {
              result.meta = `permission_denied: ${msg}`;
              console.error(
                `[deleteTemplate] Meta permission denied AND template still present for name=${doc.name}`,
              );
            }
          } catch (probeErr) {
            result.meta = `permission_denied: ${msg}`;
            console.error(
              `[deleteTemplate] list-probe failed:`,
              probeErr.response?.data?.error?.message || probeErr.message,
            );
          }
        } else {
          result.meta = `error: ${msg}`;
          console.error(
            `[deleteTemplate] Meta delete failed name=${doc.name}:`,
            msg,
            "subcode=",
            subcode,
          );
        }
      }
    } else {
      result.meta = "skipped_never_submitted";
    }

    // If Meta step failed for a real reason (not "not found" / "skipped_never_submitted"),
    // DO NOT proceed with local cleanup - otherwise the panel would show the template
    // as gone while Meta still has it (ghost template). The user must fix the token
    // permission and retry.
    const metaOk =
      result.meta === "deleted" ||
      result.meta === "not_found_on_meta" ||
      result.meta === "skipped_never_submitted";
    if (!metaOk) {
      result.cloudinary = "skipped_meta_failed";
      result.mongo = "skipped_meta_failed";
      return res.status(502).json({
        ok: false,
        error: (result.meta || "Meta delete failed").replace(
          /^permission_denied:\s*/,
          "",
        ),
        hint: result.meta?.startsWith("permission_denied")
          ? "Your Meta access token is missing the whatsapp_business_management permission, or the system user is not assigned to this WABA. Grant the permission in Meta Business Settings and try again."
          : undefined,
        result,
      });
    }

    // 2) Delete header sample from Cloudinary (only if it's actually our upload).
    if (doc.header?.mediaUrl) {
      try {
        const outcome = await deleteByUrl(doc.header.mediaUrl);
        result.cloudinary = outcome?.result || "deleted";
        console.log(
          `[deleteTemplate] Cloudinary deleted ${doc.header.mediaUrl}`,
        );
      } catch (e) {
        result.cloudinary = `error: ${e.message}`;
        console.error("[deleteTemplate] Cloudinary failed:", e.message);
      }
    } else {
      result.cloudinary = "skipped_no_media";
    }

    // 3) Delete the local Mongo doc.
    await doc.deleteOne();
    result.mongo = "deleted";

    emit("template:delete", { id: req.params.id });
    res.json({ ok: true, result });
  } catch (e) {
    console.error("[deleteTemplate]", e.message);
    res.status(500).json({ error: "Failed", details: e.message });
  }
};
