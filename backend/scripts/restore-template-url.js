require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Template = require('../models/Template');

const ORIGINAL_URL = 'https://res.cloudinary.com/dxjnqyo5x/image/upload/v1777920849/wati_panel/1777920838542_ChatGPT_Image_May_2%2C_2026%2C_05_42_46_PM.png';

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const r = await Template.updateOne(
    { name: 'welcome_message' },
    { $set: { 'header.mediaUrl': ORIGINAL_URL } }
  );
  console.log('Modified count:', r.modifiedCount);
  const t = await Template.findOne({ name: 'welcome_message' });
  console.log('mediaUrl now:', t.header.mediaUrl);
  await mongoose.disconnect();
})();
