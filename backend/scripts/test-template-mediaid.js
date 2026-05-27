require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Template = require('../models/Template');
const meta = require('../services/metaService');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const tpl = await Template.findOne({ name: 'welcome_message' });
    console.log('Source URL:', tpl.header.mediaUrl);

    console.log('\n[1] Downloading from Cloudinary...');
    const { buffer, mime } = await meta.fetchUrlToBuffer(tpl.header.mediaUrl);
    console.log('   downloaded', buffer.length, 'bytes,', mime);

    console.log('\n[2] Uploading to Meta media endpoint...');
    const upl = await meta.uploadMediaToMeta({ buffer, mime, filename: 'header.png' });
    console.log('   media id:', upl.id);

    console.log('\n[3] Sending template using media id...');
    const components = [{
      type: 'header',
      parameters: [{ type: 'image', image: { id: upl.id } }],
    }];
    const r = await meta.sendTemplateMessage('918106811285', tpl.name, tpl.language, components);
    console.log('   SENT:', JSON.stringify(r, null, 2));
  } catch (e) {
    console.error('FAIL:', JSON.stringify(e.response?.data || e.message, null, 2));
  } finally {
    await mongoose.disconnect();
  }
})();
