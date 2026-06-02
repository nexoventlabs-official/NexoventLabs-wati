const mongoose = require('mongoose');

/**
 * A phone number an admin added to the campaign list (to receive the welcome
 * template proactively). Deduplicated by waId. `lastStatus` reflects the most
 * recent send attempt so the admin can see who actually received it.
 */
const CampaignContactSchema = new mongoose.Schema(
  {
    waId: { type: String, required: true, unique: true, index: true }, // E.164 without +
    name: { type: String, default: '' },

    // Per-recipient send state for the most recent campaign send.
    //   queued    - added, not sent yet
    //   sent      - accepted by Meta / delivered
    //   delivered - delivered to the handset
    //   read      - read by the user
    //   not_whatsapp - number isn't on WhatsApp (Meta rejected) -> never charged again
    //   failed    - other failure
    lastStatus: {
      type: String,
      enum: ['queued', 'sent', 'delivered', 'read', 'not_whatsapp', 'failed'],
      default: 'queued',
    },
    lastError: { type: String, default: '' },
    lastWamid: { type: String, default: '', index: true },
    lastSentAt: { type: Date, default: null },
    sendCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CampaignContact', CampaignContactSchema);
