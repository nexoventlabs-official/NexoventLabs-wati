const axios = require('axios');

/**
 * Download an image URL and return raw base64 (no data: prefix).
 *
 * WhatsApp Flow `Image` components and `data-source` item `image` fields require
 * raw base64 (PNG/JPG) - NOT a URL. This is why category logos passed as URLs
 * never render inside the flow; they must be converted here first.
 *
 * For Cloudinary URLs we inject on-the-fly transform params (width/height/quality/
 * format) so the downloaded bytes are already small - keeping the whole flow
 * payload well under Meta's size limits.
 */
async function urlToBase64(url, opts = {}) {
  if (!url) return '';
  try {
    const fetchUrl = withCloudinaryTransform(url, opts);
    const resp = await axios.get(fetchUrl, {
      responseType: 'arraybuffer',
      timeout: 15000,
      maxContentLength: 10 * 1024 * 1024,
    });
    const base64 = Buffer.from(resp.data).toString('base64');
    return base64.replace(/^data:image\/[^;]+;base64,/, '');
  } catch (err) {
    console.warn('[imageBase64] failed for', url, err.message);
    return '';
  }
}

function withCloudinaryTransform(url, opts = {}) {
  if (!url || !url.includes('/upload/')) return url;
  const parts = [];
  if (opts.width) parts.push(`w_${opts.width}`);
  if (opts.height) parts.push(`h_${opts.height}`);
  parts.push(`c_${opts.crop || 'fill'}`);
  parts.push(`q_${opts.quality || 70}`);
  parts.push(`f_${opts.format || 'jpg'}`);
  return url.replace('/upload/', `/upload/${parts.join(',')}/`);
}

module.exports = { urlToBase64, withCloudinaryTransform };
