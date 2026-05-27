require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const axios = require('axios');

(async () => {
  const W = process.env.META_WABA_ID;
  const T = process.env.META_ACCESS_TOKEN;
  const V = process.env.META_GRAPH_VERSION || 'v21.0';
  const headers = { Authorization: `Bearer ${T}` };
  try {
    console.log('--- subscribing app to WABA ---');
    const sub = await axios.post(
      `https://graph.facebook.com/${V}/${W}/subscribed_apps`,
      null,
      { headers }
    );
    console.log('Subscribe response:', JSON.stringify(sub.data, null, 2));

    console.log('\n--- listing subscribed apps ---');
    const list = await axios.get(
      `https://graph.facebook.com/${V}/${W}/subscribed_apps`,
      { headers }
    );
    console.log('Subscribed apps:', JSON.stringify(list.data, null, 2));
  } catch (e) {
    console.error('FAIL:', JSON.stringify(e.response?.data || e.message, null, 2));
    process.exit(1);
  }
})();
