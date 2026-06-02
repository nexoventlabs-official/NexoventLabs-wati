const mongoose = require('mongoose');

/**
 * A promotable "category" the business offers (e.g. WhatsApp Automation,
 * Chatbot, CRM). Each category powers TWO things:
 *
 *   1. A button/row inside the auto "welcome" message a customer receives when
 *      they say "hi". Tapping it triggers the category's promo message.
 *   2. A promo WhatsApp message = IMAGE header + body promotion + a single
 *      "DEMO" CTA URL button. The same structure is also submitted to Meta as
 *      a reusable message template so the admin can broadcast it proactively
 *      (outside the 24h service window) once Meta approves it.
 */
const CategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },

    // The small "option" logo shown in the admin list (#option.png style).
    logoUrl: { type: String, default: '' },

    // The IMAGE header used on the promo WhatsApp message + Meta template.
    headerImageUrl: { type: String, default: '' },

    // Promotional body copy of the WhatsApp message / template body.
    bodyContent: { type: String, default: '' },

    // CTA URL button. Label defaults to "DEMO".
    ctaText: { type: String, default: 'DEMO' },
    ctaUrl: { type: String, default: '' },

    active: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },

    // --- Meta template linkage --------------------------------------------
    // We mirror the category into a Template doc so it can be submitted to Meta
    // for approval and later broadcast via the existing Templates drawer.
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Template', default: null },
    templateName: { type: String, default: '' },
    metaStatus: {
      type: String,
      enum: ['NONE', 'DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'PAUSED', 'DISABLED', 'IN_APPEAL'],
      default: 'NONE',
    },
    metaRejectedReason: { type: String, default: '' },
  },
  { timestamps: true }
);

CategorySchema.index({ active: 1, sortOrder: 1 });

module.exports = mongoose.model('Category', CategorySchema);
