const mongoose = require('mongoose');

/**
 * Cloudinary URLs for images used by the WhatsApp welcome flow.
 * `key` is a stable identifier the backend looks up at runtime
 * (see services/flowImages.js for the catalog of keys).
 */
const FlowImageSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    label: { type: String, default: '' },
    url: { type: String, default: '' },
    publicId: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('FlowImage', FlowImageSchema);
