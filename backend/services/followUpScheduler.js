const Contact = require('../models/Contact');
const followUp = require('./followUpService');

// Poll interval for due follow-ups. 30s is plenty for a 5-minute delay.
const TICK_MS = 30 * 1000;

let timer = null;
let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    const now = new Date();
    const due = await Contact.find({
      followUpSent: false,
      followUpDueAt: { $ne: null, $lte: now },
    }).limit(25);

    for (const contact of due) {
      // Mark as sent FIRST (optimistic) so a slow send can't be double-fired
      // by the next tick.
      contact.followUpSent = true;
      contact.followUpDueAt = null;
      await contact.save();
      try {
        await followUp.sendFollowUpPrompt(contact);
        console.log(`[followUp] prompt sent to ${contact.waId}`);
      } catch (e) {
        console.error('[followUp] send failed', contact.waId, e.response?.data?.error?.message || e.message);
      }
    }
  } catch (e) {
    console.error('[followUpScheduler] tick error', e.message);
  } finally {
    running = false;
  }
}

function start() {
  if (timer) return;
  timer = setInterval(tick, TICK_MS);
  console.log('[followUpScheduler] started (tick every', TICK_MS / 1000, 's)');
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { start, stop, tick };
