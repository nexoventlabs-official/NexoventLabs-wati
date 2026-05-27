require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Message = require('../models/Message');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const fails = await Message.find({ status: 'failed' }).sort({ createdAt: -1 }).limit(10);
  for (const m of fails) {
    console.log('---');
    console.log('createdAt:', m.createdAt);
    console.log('type:', m.type, 'tpl:', m.templateName);
    console.log('wamid:', m.wamid);
    console.log('failureReason:', m.failureReason);
    console.log('raw status from webhook:', JSON.stringify(m.raw, null, 2)?.slice(0, 600));
  }
  await mongoose.disconnect();
})();
