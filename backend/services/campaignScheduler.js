/**
 * campaignScheduler.js
 * Polls every minute for any campaign contacts whose `scheduledAt` time has
 * arrived (and whose lastStatus is still 'scheduled') and fires the send.
 * This keeps the scheduler logic decoupled from the HTTP layer.
 */

const CampaignContact = require('../models/CampaignContact');
const Contact = require('../models/Contact');
const Message = require('../models/Message');
const welcomeTemplate = require('./welcomeTemplateService');
const welcomeService = require('./welcomeService');
const { emit } = require('./socketService');
const redis = require('./redisService');

const POLL_INTERVAL_MS = 60 * 1000; // 1 minute

/**
 * Execute the actual send for an array of CampaignContact documents.
 * Mirrors the logic in campaignController.send so both paths stay in sync.
 */
async function executeSend(targets) {
  const tplName = await welcomeTemplate.getTemplateName();
  await welcomeService.getWelcome(); // warm cache

  for (const t of targets) {
    try {
      const resp = await welcomeTemplate.sendToContact(t.waId);
      const wamid = resp?.messages?.[0]?.id || '';

      t.lastStatus = 'sent';
      t.lastError = '';
      t.lastWamid = wamid;
      t.lastSentAt = new Date();
      t.scheduledAt = null;
      t.sendCount = (t.sendCount || 0) + 1;
      await t.save();
      emit('campaign:update', t);

      // Mirror into the wati chat panel.
      let contact = await Contact.findOne({ waId: t.waId });
      if (!contact) contact = await Contact.create({ waId: t.waId, name: t.name || '' });
      const welcome = await welcomeService.getWelcome();
      const seq = await redis.nextSeq();
      const msg = await Message.create({
        contact: contact._id,
        waId: t.waId,
        direction: 'outbound',
        wamid,
        type: 'template',
        templateName: tplName,
        templateData: {
          header: welcome.headerImage ? { type: 'IMAGE', mediaUrl: welcome.headerImage } : { type: 'NONE' },
          body: welcome.body,
          footer: welcome.footer,
          buttons: [{ type: 'QUICK_REPLY', text: welcome.cta || 'View Services' }],
        },
        text: `[welcome template] ${tplName}`,
        status: 'sent',
        seq,
      });
      contact.lastMessageAt = new Date();
      contact.lastMessagePreview = '[campaign] welcome';
      await contact.save();
      emit('message:new', msg);
      emit('contact:upsert', contact);
    } catch (e) {
      const err = e.response?.data?.error;
      const code = err?.code;
      const notWa =
        code === 131026 ||
        code === 131056 ||
        /not.*whatsapp|invalid.*recipient/i.test(err?.message || '');
      t.lastStatus = notWa ? 'not_whatsapp' : 'failed';
      t.lastError = err?.error_user_msg || err?.message || e.message;
      t.lastSentAt = new Date();
      t.scheduledAt = null;
      await t.save();
      emit('campaign:update', t);
      console.warn(`[campaignScheduler] ${t.waId} -> ${t.lastStatus}: ${t.lastError}`);
    }
  }
}

/**
 * Check for due scheduled contacts and fire them.
 */
async function tick() {
  try {
    const now = new Date();
    const due = await CampaignContact.find({
      lastStatus: 'scheduled',
      scheduledAt: { $lte: now },
    });

    if (!due.length) return;

    console.log(`[campaignScheduler] Firing ${due.length} scheduled contact(s)…`);

    // Verify template is still approved before sending.
    let status;
    try {
      ({ status } = await welcomeTemplate.refresh());
    } catch {
      ({ status } = await welcomeTemplate.getStatus());
    }

    if (status !== 'APPROVED') {
      console.warn(`[campaignScheduler] Template status is ${status}. Aborting scheduled send.`);
      // Mark them as failed so the admin can see and retry.
      for (const t of due) {
        t.lastStatus = 'failed';
        t.lastError = `Template not APPROVED (${status}) at scheduled send time.`;
        t.scheduledAt = null;
        await t.save();
        emit('campaign:update', t);
      }
      return;
    }

    await executeSend(due);
  } catch (e) {
    console.error('[campaignScheduler] tick error:', e.message);
  }
}

/**
 * Start the polling loop. Call once from server.js after DB connection.
 */
function start() {
  console.log('[campaignScheduler] Started — polling every 60s for scheduled sends.');
  // Run once immediately, then on interval.
  tick();
  setInterval(tick, POLL_INTERVAL_MS);
}

module.exports = { start, executeSend };
