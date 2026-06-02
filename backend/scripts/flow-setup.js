/**
 * Create (if needed) + update JSON + publish the Nexovent category-picker flow
 * on Meta, persisting the flow id to the Setting store.
 *
 * Usage:  node scripts/flow-setup.js
 *
 * Requires META_ACCESS_TOKEN / META_WABA_ID / META_PHONE_NUMBER_ID in .env.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const { connectDB } = require('../config/db');
const flowService = require('../services/flowService');

(async () => {
  try {
    await connectDB();
    console.log('• Ensuring flow exists, uploading JSON, publishing…');
    const { flowId, status, validationErrors } = await flowService.ensureFlowPublished();
    if (validationErrors?.length) {
      console.warn('⚠️  Validation warnings:', JSON.stringify(validationErrors, null, 2));
    }
    console.log(`✅ Flow ready: id=${flowId} status=${status}`);
    process.exit(0);
  } catch (e) {
    console.error('❌ flow-setup failed:', e.response?.data || e.message);
    process.exit(1);
  }
})();
