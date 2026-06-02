const FlowImage = require('../models/FlowImage');

/**
 * Catalog of every image slot the WhatsApp welcome flow / welcome message uses.
 * The admin "Flow Images" page renders this list and lets the user upload an
 * image per key.
 */
const IMAGE_KEYS = [
  {
    key: 'welcome_header',
    label: 'Welcome message header image (sent with the "View Services" message on "hi")',
    group: 'welcome',
  },
  {
    key: 'welcome_flow_banner',
    label: 'Welcome flow banner (top of the category picker screen)',
    group: 'welcome',
  },
  {
    key: 'followup_header',
    label: 'Follow-up prompt header image (Interested / Not Interested message)',
    group: 'followup',
  },
  {
    key: 'interested_header',
    label: 'Interested reply header image (Our team will contact you)',
    group: 'followup',
  },
  {
    key: 'not_interested_header',
    label: 'Not Interested reply header image',
    group: 'followup',
  },
];

async function ensureKeysExist() {
  for (const item of IMAGE_KEYS) {
    await FlowImage.updateOne(
      { key: item.key },
      { $setOnInsert: { key: item.key, label: item.label, url: '', publicId: '' } },
      { upsert: true }
    );
  }
}

async function getUrl(key) {
  const doc = await FlowImage.findOne({ key }).lean();
  return doc?.url || '';
}

async function getMap(keys) {
  const docs = await FlowImage.find({ key: { $in: keys } }).lean();
  const out = {};
  keys.forEach((k) => (out[k] = ''));
  docs.forEach((d) => { out[d.key] = d.url || ''; });
  return out;
}

module.exports = { IMAGE_KEYS, ensureKeysExist, getUrl, getMap };
