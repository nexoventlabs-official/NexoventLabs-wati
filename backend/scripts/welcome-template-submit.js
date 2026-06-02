/**
 * Submit the welcome message to Meta as a reusable template.
 * Requires: a welcome header image uploaded + a published flow.
 *
 * Usage: node scripts/welcome-template-submit.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const { connectDB } = require('../config/db');
const welcomeTemplate = require('../services/welcomeTemplateService');

(async () => {
  try {
    await connectDB();
    console.log('• Submitting welcome template to Meta…');
    const status = await welcomeTemplate.submit();
    console.log('✅ Submitted:', JSON.stringify(status));
    process.exit(0);
  } catch (e) {
    console.error('❌ submit failed:', e.response?.data?.error || e.message);
    process.exit(1);
  }
})();
