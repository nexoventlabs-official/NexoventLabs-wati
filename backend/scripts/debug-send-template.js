require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Template = require('../models/Template');
const meta = require('../services/metaService');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const tpl = await Template.findOne({ name: 'welcome_message' });
    console.log('Using mediaUrl:', tpl.header.mediaUrl);

    const components = [{
      type: 'header',
      parameters: [{ type: 'image', image: { link: tpl.header.mediaUrl } }],
    }];

    const r = await meta.sendTemplateMessage('918106811285', tpl.name, tpl.language, components);
    console.log('SENT:', JSON.stringify(r, null, 2));
  } catch (e) {
    console.error('FAIL:', JSON.stringify(e.response?.data || e.message, null, 2));
  } finally {
    await mongoose.disconnect();
  }
})();
