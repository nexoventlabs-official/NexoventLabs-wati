const mongoose = require("mongoose");

const TemplateSchema = new mongoose.Schema(
  {
    metaId: { type: String, index: true },
    name: { type: String, required: true, index: true },
    language: { type: String, default: "en_US" },
    category: { type: String, default: "MARKETING" }, // MARKETING | UTILITY | AUTHENTICATION
    status: {
      type: String,
      enum: [
        "DRAFT",
        "PENDING",
        "APPROVED",
        "REJECTED",
        "PAUSED",
        "DISABLED",
        "IN_APPEAL",
      ],
      default: "DRAFT",
    },
    rejectedReason: { type: String, default: "" },
    header: {
      type: {
        type: String,
        enum: ["NONE", "TEXT", "IMAGE", "VIDEO", "DOCUMENT"],
        default: "NONE",
      },
      text: String,
      mediaUrl: String, // cloudinary
    },
    body: { type: String, required: true },
    footer: { type: String, default: "" },
    buttons: [
      {
        type: {
          type: String,
          enum: ["QUICK_REPLY", "URL", "PHONE_NUMBER"],
          default: "QUICK_REPLY",
        },
        text: String,
        url: String,
        phone_number: String,
        // For QUICK_REPLY only: free-form text the system auto-sends when the
        // customer taps this button. Saved locally only - Meta does NOT store this.
        replyText: { type: String, default: "" },
        // For QUICK_REPLY 'Interested' button: the per-template demo URL sent as
        // a CTA button in the interested reply. Overrides the global admin setting.
        demoUrl: { type: String, default: "" },
      },
    ],
    components: { type: Object }, // exact payload sent to Meta
    lastSyncedAt: Date,
  },
  { timestamps: true },
);

module.exports = mongoose.model("Template", TemplateSchema);
