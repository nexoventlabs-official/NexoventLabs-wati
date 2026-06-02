const mongoose = require('mongoose');

/**
 * Tiny key/value store for runtime app settings that we don't want to hard-code
 * in .env - most importantly the published WhatsApp Flow id + status used by
 * the category welcome menu.
 */
const SettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    value: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

SettingSchema.statics.get = async function (key, fallback = null) {
  const doc = await this.findOne({ key }).lean();
  return doc ? doc.value : fallback;
};

SettingSchema.statics.put = async function (key, value) {
  return this.findOneAndUpdate(
    { key },
    { $set: { value } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

module.exports = mongoose.model('Setting', SettingSchema);
