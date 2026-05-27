require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Template = require('../models/Template');
const meta = require('../services/metaService');

const ID = process.argv[2] || '69f8eb87daa6d37d4362c1dc';

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const doc = await Template.findById(ID);
    if (!doc) { console.log('No template'); process.exit(0); }
    console.log('--- TEMPLATE DOC ---');
    console.log(JSON.stringify(doc.toObject(), null, 2));

    const components = JSON.parse(JSON.stringify(doc.components || []));
    const header = components.find(c => c.type === 'HEADER');
    if (header && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(header.format)) {
      const mediaUrl = doc.header?.mediaUrl || header.example?.header_handle?.[0];
      console.log('\n--- UPLOADING HEADER ---', mediaUrl);
      try {
        const { header_handle } = await meta.uploadHeaderSample({
          fileUrl: mediaUrl,
          fileName: 'header',
          fileType: header.format === 'IMAGE' ? 'image/jpeg' : header.format === 'VIDEO' ? 'video/mp4' : 'application/pdf',
        });
        console.log('handle:', header_handle);
        header.example = { header_handle: [header_handle] };
      } catch (e) {
        console.error('UPLOAD FAILED:', JSON.stringify(e.response?.data || e.message, null, 2));
        process.exit(1);
      }
    }

    const payload = { name: doc.name, language: doc.language, category: doc.category, components };
    console.log('\n--- PAYLOAD TO META ---');
    console.log(JSON.stringify(payload, null, 2));

    const resp = await meta.createTemplate(payload);
    console.log('\n--- META RESPONSE ---');
    console.log(JSON.stringify(resp, null, 2));
  } catch (e) {
    console.error('\n--- ERROR ---');
    console.error(JSON.stringify(e.response?.data || e.message, null, 2));
  } finally {
    await mongoose.disconnect();
  }
})();
