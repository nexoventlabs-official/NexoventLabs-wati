const mongoose = require('mongoose');

const CALL_STATUSES = [
  'none',
  'first_call_completed',
  'second_call_completed',
  'third_call_completed',
  'switch_off',
  'busy',
  'after_call',
  'not_interested',
  'interested',
  'hold',
];

const SOURCES = ['whatsapp_direct', 'facebook_ad', 'instagram_ad', 'unknown'];

const ContactSchema = new mongoose.Schema(
  {
    waId: { type: String, required: true, unique: true, index: true }, // phone number (E.164 without +)
    name: { type: String, default: '' },
    profileName: { type: String, default: '' }, // from WA webhook
    profilePicUrl: { type: String, default: '' },
    lastMessageAt: { type: Date, default: null },
    lastMessagePreview: { type: String, default: '' },
    unreadCount: { type: Number, default: 0 },
    // 24h window: updated whenever customer sends a message
    lastCustomerMessageAt: { type: Date, default: null },
    // Acquisition source. 'facebook_ad' / 'instagram_ad' come from the Click-to-WhatsApp
    // referral payload that Meta attaches to the FIRST inbound message after the user
    // taps a CTWA ad. These contacts get a 72h customer-service window instead of 24h.
    source: { type: String, enum: SOURCES, default: 'whatsapp_direct' },
    referral: {
      source_url: String,    // URL of the FB/IG ad / post
      source_id: String,     // Ad/post id
      source_type: String,   // 'ad' | 'post' (per Meta)
      headline: String,
      body: String,
      ctwa_clid: String,     // Click-to-WhatsApp click id (for attribution)
      capturedAt: Date,
    },
    callStatus: { type: String, enum: CALL_STATUSES, default: 'none' },
    // Append-only audit log of every call-status change. Each entry stores the
    // status that was *set* and a timestamp; the latest entry's `status` should
    // always equal `callStatus`. Cleared on `clearChat`.
    callStatusHistory: [
      new mongoose.Schema(
        {
          status: { type: String, enum: CALL_STATUSES, required: true },
          changedBy: { type: String, default: '' }, // reserved for future auth
        },
        { timestamps: { createdAt: true, updatedAt: false }, _id: true }
      ),
    ],
    // Legacy single-field note. New writes go into `notes[]` below; we keep
    // this for backward-compat reads and migrate older records lazily.
    comment: { type: String, default: '' },
    // Append-only history of internal notes. Each entry gets its own timestamp
    // so the panel can show a full audit trail per contact.
    notes: [
      new mongoose.Schema(
        {
          text: { type: String, required: true, trim: true },
          addedBy: { type: String, default: '' }, // reserved for future auth
        },
        { timestamps: { createdAt: true, updatedAt: false }, _id: true }
      ),
    ],
    typing: { type: Boolean, default: false },
    // Pin a conversation to the top of the chat list (panel-side preference).
    pinned: { type: Boolean, default: false },
    pinnedAt: { type: Date, default: null },
    // The category the customer last chose from the welcome menu (by tapping a
    // category button). Surfaced in the chat + admin panel so agents know what
    // the lead is interested in.
    selectedCategory: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
    selectedCategoryName: { type: String, default: '' },
    selectedCategoryAt: { type: Date, default: null },
    // Append-only log of every category the contact has shown interest in.
    categoryHistory: [
      new mongoose.Schema(
        {
          category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
          name: { type: String, default: '' },
        },
        { timestamps: { createdAt: true, updatedAt: false }, _id: true }
      ),
    ],
    // Last time the auto-welcome (video + Register CTA) was successfully sent
    // to this contact. Used to suppress duplicate welcomes when the same user
    // sends multiple greetings in a short window (see WELCOME_COOLDOWN_MS in
    // webhookController).
    welcomeSentAt: { type: Date, default: null },
    // Lead follow-up: 5 min after a customer picks a service we send an
    // Interested / Not Interested prompt. These fields drive the scheduler.
    followUpDueAt: { type: Date, default: null, index: true },
    followUpSent: { type: Boolean, default: false },
    // 'none' until they answer the follow-up; then 'interested'/'not_interested'.
    leadResponse: { type: String, enum: ['none', 'interested', 'not_interested'], default: 'none' },
    leadResponseAt: { type: Date, default: null },
  },
  { timestamps: true }
);

ContactSchema.virtual('windowExpiresAt').get(function () {
  if (!this.lastCustomerMessageAt) return null;
  // Click-to-WhatsApp Ads grant a 72h customer-service window per Meta policy.
  const hours = (this.source === 'facebook_ad' || this.source === 'instagram_ad') ? 72 : 24;
  return new Date(this.lastCustomerMessageAt.getTime() + hours * 60 * 60 * 1000);
});

ContactSchema.virtual('windowHours').get(function () {
  return (this.source === 'facebook_ad' || this.source === 'instagram_ad') ? 72 : 24;
});

ContactSchema.set('toJSON', { virtuals: true });
ContactSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Contact', ContactSchema);
module.exports.CALL_STATUSES = CALL_STATUSES;
