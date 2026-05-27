// Recovery: a template's header.mediaUrl on Cloudinary 404s (the asset was deleted).
// We re-download from Meta's header_handle (still valid for a while) and re-upload
// to Cloudinary, then patch the template doc.
//
// Usage: node scripts/restore_template_header.js <templateName> [language]
require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const Template = require('../models/Template');
const { uploadBuffer } = require('../config/cloudinary');

(async () => {
  const name = process.argv[2];
  const language = process.argv[3] || 'en_US';
  if (!name) {
    console.error('Usage: node scripts/restore_template_header.js <name> [language]');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  const tpl = await Template.findOne({ name, language });
  if (!tpl) { console.error('Template not found'); process.exit(1); }

  const headerComp = (tpl.components || []).find(c => c.type === 'HEADER');
  const handle = headerComp?.example?.header_handle?.[0];
  if (!handle) { console.error('No header_handle on template; cannot recover.'); process.exit(1); }

  // Verify current Cloudinary URL is broken
  if (tpl.header?.mediaUrl) {
    try {
      const r = await axios.head(tpl.header.mediaUrl);
      if (r.status === 200) {
        console.log('Cloudinary URL still works; nothing to do.');
        await mongoose.disconnect();
        return;
      }
    } catch (e) {
      if (e.response?.status !== 404) {
        console.error('Unexpected status checking Cloudinary URL:', e.response?.status, e.message);
      }
    }
  }

  console.log('Downloading from Meta header_handle...');
  const dl = await axios.get(handle, { responseType: 'arraybuffer' });
  const buf = Buffer.from(dl.data);
  const mime = dl.headers['content-type'] || 'image/jpeg';
  console.log(`Got ${buf.length} bytes, mime=${mime}`);

  console.log('Re-uploading to Cloudinary...');
  const upl = await uploadBuffer(buf, {
    folder: 'wati_panel/misc',
    filename: `${name}_header_${Date.now()}.jpg`,
    mime,
  });
  console.log('Cloudinary url:', upl.secure_url);

  tpl.header.mediaUrl = upl.secure_url;
  await tpl.save();
  console.log('Template patched. Done.');
  await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
