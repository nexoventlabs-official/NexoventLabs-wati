const FlowImage = require('../models/FlowImage');
const { IMAGE_KEYS, ensureKeysExist } = require('../services/flowImages');
const { uploadBuffer, deleteByUrl } = require('../config/cloudinary');

// GET /api/flow-images -> list every slot (with current url if uploaded).
exports.list = async (_req, res) => {
  await ensureKeysExist();
  const docs = await FlowImage.find({}).lean();
  const map = new Map(docs.map((d) => [d.key, d]));
  const items = IMAGE_KEYS.map((spec) => {
    const doc = map.get(spec.key) || {};
    return {
      key: spec.key,
      label: spec.label,
      group: spec.group,
      url: doc.url || '',
      publicId: doc.publicId || '',
      updatedAt: doc.updatedAt || null,
    };
  });
  res.json({ images: items });
};

// PUT /api/flow-images/:key  body: { url, publicId? }
// The image bytes are uploaded separately via /api/upload (Cloudinary), which
// returns a URL we store here. Keeps this endpoint JSON-only.
exports.set = async (req, res) => {
  try {
    const { key } = req.params;
    if (!IMAGE_KEYS.find((k) => k.key === key)) return res.status(400).json({ error: 'Unknown key' });
    const url = req.body?.url || '';
    if (!url) return res.status(400).json({ error: 'url required' });

    const existing = await FlowImage.findOne({ key });
    if (existing?.url && existing.url !== url) {
      deleteByUrl(existing.url).catch(() => {});
    }

    const doc = await FlowImage.findOneAndUpdate(
      { key },
      { $set: { url, publicId: req.body?.publicId || '' } },
      { upsert: true, new: true }
    );
    res.json({ image: doc });
  } catch (err) {
    console.error('[flowImages.set]', err.message);
    res.status(500).json({ error: err.message });
  }
};

// DELETE /api/flow-images/:key -> clear the slot (and remove from Cloudinary).
exports.remove = async (req, res) => {
  try {
    const { key } = req.params;
    const doc = await FlowImage.findOne({ key });
    if (doc?.url) deleteByUrl(doc.url).catch(() => {});
    await FlowImage.updateOne({ key }, { $set: { url: '', publicId: '' } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
