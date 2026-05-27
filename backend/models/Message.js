const mongoose = require('mongoose');

const ReactionSchema = new mongoose.Schema(
  {
    emoji: String,
    from: { type: String, enum: ['agent', 'customer'] },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const MessageSchema = new mongoose.Schema(
  {
    contact: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', index: true },
    waId: { type: String, index: true }, // phone
    direction: { type: String, enum: ['inbound', 'outbound'], required: true },
    wamid: { type: String, index: true }, // Meta message id
    replyToWamid: { type: String, default: null },
    type: {
      type: String,
      enum: ['text', 'image', 'video', 'audio', 'document', 'sticker', 'template', 'reaction', 'location', 'contacts', 'button', 'interactive', 'unsupported'],
      required: true,
    },
    text: { type: String, default: '' },
    mediaUrl: { type: String, default: '' }, // Cloudinary or Meta media
    mediaMime: { type: String, default: '' },
    mediaFilename: { type: String, default: '' },
    caption: { type: String, default: '' },
    templateName: { type: String, default: '' },
    // When this message originated from a template (paid template send OR the
    // 24h-window free-form short-circuit), keep a copy of the rendered template
    // structure so the panel can show a "template card" with body/footer/buttons.
    // `default: undefined` is critical - without it, Mongoose auto-creates an
    // empty subdoc on EVERY message, which would make the UI render every chat
    // bubble as an empty template card.
    templateData: {
      type: new mongoose.Schema(
        {
          header: {
            type: { type: String, enum: ['NONE', 'TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'], default: 'NONE' },
            text: String,
            mediaUrl: String,
          },
          body: String,
          footer: String,
          buttons: [
            {
              type: { type: String, enum: ['QUICK_REPLY', 'URL', 'PHONE_NUMBER'] },
              text: String,
              url: String,
              phone_number: String,
            },
          ],
        },
        { _id: false }
      ),
      default: undefined,
    },
    status: {
      type: String,
      enum: ['queued', 'sent', 'delivered', 'read', 'failed'],
      default: 'queued',
    },
    failureReason: { type: String, default: '' },
    reactions: [ReactionSchema],
    deleted: { type: Boolean, default: false },
    // Monotonic global sequence (Redis INCR) used to tiebreak messages that share a createdAt
    // second - ensures rapid-fire messages display in true arrival order.
    seq: { type: Number, default: 0, index: true },
    raw: { type: Object }, // debugging
  },
  { timestamps: true }
);

MessageSchema.index({ contact: 1, createdAt: 1, seq: 1 });

module.exports = mongoose.model('Message', MessageSchema);
