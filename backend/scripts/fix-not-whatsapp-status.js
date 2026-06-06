/**
 * fix-not-whatsapp-status.js
 *
 * One-time migration: finds all CampaignContact documents where the
 * corresponding outbound Message failed with "Recipient not reachable"
 * (Meta error 131026 / 131056) but the campaign contact still shows
 * lastStatus = 'sent' (or 'failed').
 *
 * It corrects them to lastStatus = 'not_whatsapp' so the admin panel
 * displays the right status.
 *
 * Run once from the backend directory:
 *   node scripts/fix-not-whatsapp-status.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const CampaignContact = require('../models/CampaignContact');
const Message = require('../models/Message');

// Error codes that mean "number not on WhatsApp / blocked"
const NOT_WA_CODES = [131026, 131056];
// Text patterns in failureReason JSON
const NOT_WA_PATTERN = /131026|131056|not.*whatsapp|invalid.*recipient|recipient.*not.*reachable|not.*registered/i;

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('[migrate] Connected to MongoDB');

  // Fetch all campaign contacts that are NOT already correctly flagged
  const contacts = await CampaignContact.find({
    lastStatus: { $in: ['sent', 'failed', 'delivered'] },
    lastWamid: { $ne: '' },
  }).lean();

  console.log(`[migrate] Found ${contacts.length} contacts to check (sent/failed with a wamid)`);

  let updated = 0;
  let skipped = 0;

  for (const cc of contacts) {
    if (!cc.lastWamid) { skipped++; continue; }

    // Find the outbound template message sent to this contact
    const msg = await Message.findOne({
      wamid: cc.lastWamid,
      direction: 'outbound',
    }).lean();

    if (!msg) { skipped++; continue; }

    // Only care about messages that failed
    if (msg.status !== 'failed') { skipped++; continue; }

    // Check if the failureReason matches a "not on WhatsApp / blocked" error
    const fr = msg.failureReason || '';
    let isNotWa = false;

    if (fr) {
      // Try to parse as JSON array (how it's stored from the webhook)
      try {
        const parsed = JSON.parse(fr);
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        isNotWa = arr.some((e) =>
          NOT_WA_CODES.includes(Number(e.code)) ||
          NOT_WA_PATTERN.test(e.message || e.title || '')
        );
      } catch {
        // Stored as plain string
        isNotWa = NOT_WA_PATTERN.test(fr);
      }
    }

    if (!isNotWa) { skipped++; continue; }

    // Update the campaign contact
    await CampaignContact.updateOne(
      { _id: cc._id },
      {
        $set: {
          lastStatus: 'not_whatsapp',
          lastError: 'Recipient not reachable — not on WhatsApp or has blocked this business.',
        },
      }
    );

    updated++;
    console.log(`  ✓ ${cc.waId}  ${cc.lastStatus} → not_whatsapp  (wamid: ${cc.lastWamid})`);
  }

  console.log(`\n[migrate] Done. Updated: ${updated}  |  Skipped/unchanged: ${skipped}`);
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error('[migrate] Error:', e.message);
  process.exit(1);
});
