// Map Meta Cloud API error codes to short user-friendly summaries.
// Refs: https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes/
const FRIENDLY = {
  131042: { title: 'Payment method not configured', detail: 'Add a payment method and set country/currency on your Meta Business account before sending billed templates.' },
  131026: { title: 'Recipient not reachable', detail: 'The number is not on WhatsApp or has blocked your business.' },
  131047: { title: '24-hour window closed', detail: 'You can only send approved templates outside the 24-hour customer service window.' },
  131048: { title: 'Spam rate limit', detail: 'Too many template sends - throttled by Meta. Try again later.' },
  131049: { title: 'User experience rate limit', detail: 'Meta limited delivery to protect user experience. Try later.' },
  131051: { title: 'Unsupported message type', detail: 'This message type is not supported for the recipient.' },
  131052: { title: 'Media download error', detail: 'Meta could not download the media from your URL. Re-upload the file.' },
  131053: { title: 'Media upload error', detail: 'Meta could not fetch the media URL (often 403/404 from origin).' },
  131056: { title: 'Pair rate limit', detail: 'Too many messages between this business and recipient. Wait a bit.' },
  132000: { title: 'Template parameter mismatch', detail: 'Number/format of template variables does not match the approved version.' },
  132001: { title: 'Template does not exist', detail: 'Template name/language not found or not yet approved.' },
  132005: { title: 'Translated text too long', detail: 'A localized template parameter exceeds the limit.' },
  132007: { title: 'Template format mismatch', detail: 'Header/body/button format does not match the approved template.' },
  132012: { title: 'Parameter format mismatch', detail: 'A parameter value has the wrong format.' },
  132015: { title: 'Template paused', detail: 'Meta has paused this template due to low quality.' },
  132016: { title: 'Template disabled', detail: 'This template was disabled by Meta.' },
  133000: { title: 'Account migration in progress', detail: 'WABA being migrated; try later.' },
  133010: { title: 'Phone number not registered', detail: 'Register your business phone number with Cloud API.' },
  130429: { title: 'Rate limit hit', detail: 'Too many requests. Slow down and retry.' },
  130472: { title: 'Recipient not allowed', detail: 'In dev mode, add this number to your test recipients list.' },
  368: { title: 'Temporarily blocked', detail: 'Meta has temporarily blocked this account from policy violations.' },
  100: { title: 'Invalid parameter', detail: 'Request parameter invalid - check shape and values.' },
  190: { title: 'Access token invalid/expired', detail: 'Refresh META_ACCESS_TOKEN.' },
  200: { title: 'Permission denied', detail: 'Token missing whatsapp_business_messaging permission.' },
  4: { title: 'Application rate limit', detail: 'Your app hit Meta\'s rate limit. Slow down.' },
  80007: { title: 'Rate limit', detail: 'Rate limit hit. Try again later.' },
};

function summarize(failureReason) {
  if (!failureReason) return null;
  let arr = failureReason;
  try { if (typeof failureReason === 'string') arr = JSON.parse(failureReason); } catch { /* keep as string */ }
  if (!Array.isArray(arr)) arr = [arr];
  const first = arr[0];
  if (!first) return null;
  const code = first.code;
  const fr = FRIENDLY[code];
  const detailFromMeta = first.error_data?.details || first.message || '';
  if (fr) {
    return {
      code,
      title: fr.title,
      detail: fr.detail || detailFromMeta,
      raw: detailFromMeta,
      href: first.href,
    };
  }
  return {
    code: code || 0,
    title: first.title || 'Send failed',
    detail: detailFromMeta || 'Unknown error',
    raw: detailFromMeta,
    href: first.href,
  };
}

module.exports = { FRIENDLY, summarize };
