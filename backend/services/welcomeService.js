const Setting = require('../models/Setting');
const flowImages = require('./flowImages');

// Setting keys for the editable welcome copy.
const BODY_KEY = 'welcome_body';
const FOOTER_KEY = 'welcome_footer';
const CTA_KEY = 'welcome_cta';

// Defaults used until an admin edits them on the Welcome Details page.
const DEFAULT_BODY =
  'Convert your business into WhatsApp 🚀\n\nGrow your business from today and start your *15 days FREE trial*. Tap *View Services* to explore and get a quick demo.';
const DEFAULT_FOOTER = 'Nexovent Labs · WhatsApp Automation';
const DEFAULT_CTA = 'View Services';

async function getWelcome() {
  const [body, footer, cta] = await Promise.all([
    Setting.get(BODY_KEY, DEFAULT_BODY),
    Setting.get(FOOTER_KEY, DEFAULT_FOOTER),
    Setting.get(CTA_KEY, DEFAULT_CTA),
  ]);
  const headerImage = await flowImages.getUrl('welcome_header');
  const bannerImage = await flowImages.getUrl('welcome_flow_banner');
  return {
    body: body || DEFAULT_BODY,
    footer: footer || DEFAULT_FOOTER,
    cta: cta || DEFAULT_CTA,
    headerImage: headerImage || '',
    bannerImage: bannerImage || '',
  };
}

async function setWelcome({ body, footer, cta }) {
  if (body !== undefined) await Setting.put(BODY_KEY, String(body));
  if (footer !== undefined) await Setting.put(FOOTER_KEY, String(footer));
  if (cta !== undefined) await Setting.put(CTA_KEY, String(cta));
  return getWelcome();
}

module.exports = {
  getWelcome,
  setWelcome,
  BODY_KEY,
  FOOTER_KEY,
  CTA_KEY,
  DEFAULT_BODY,
  DEFAULT_FOOTER,
  DEFAULT_CTA,
};
