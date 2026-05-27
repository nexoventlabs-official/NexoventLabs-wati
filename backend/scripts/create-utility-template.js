require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Template = require('../models/Template');
const meta = require('../services/metaService');
const { emit } = require('../services/socketService');

const TEMPLATE = {
  name: 'support_received',
  language: 'en_US',
  category: 'UTILITY',
  components: [
    {
      type: 'BODY',
      text: 'Hi! We received your message and will respond shortly. Thank you for contacting TNVS.',
    },
    {
      type: 'FOOTER',
      text: 'TNVS Support',
    },
  ],
};

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    console.log('--- Submitting to Meta ---');
    const resp = await meta.createTemplate(TEMPLATE);
    console.log('Meta response:', JSON.stringify(resp, null, 2));

    console.log('\n--- Saving to local DB ---');
    const doc = await Template.findOneAndUpdate(
      { name: TEMPLATE.name, language: TEMPLATE.language },
      {
        metaId: resp.id,
        name: TEMPLATE.name,
        language: TEMPLATE.language,
        category: TEMPLATE.category,
        status: (resp.status || 'PENDING').toUpperCase(),
        components: TEMPLATE.components,
        body: TEMPLATE.components.find(c => c.type === 'BODY').text,
        footer: TEMPLATE.components.find(c => c.type === 'FOOTER')?.text || '',
        header: { type: 'NONE' },
        buttons: [],
        lastSyncedAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    console.log('Saved:', doc.name, doc.status, doc._id.toString());
  } catch (e) {
    console.error('FAIL:', JSON.stringify(e.response?.data || e.message, null, 2));
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
})();
