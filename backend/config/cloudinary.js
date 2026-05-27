const cloudinary = require('cloudinary').v2;
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// In-memory multer for direct streaming to Cloudinary
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 32 * 1024 * 1024 },
});

// PDFs are stored as `image` resource type so Cloudinary delivers them without hitting
// the default "raw PDF delivery is blocked" security restriction. Everything non-media stays `raw`.
function resourceTypeOf(mime) {
  if (!mime) return 'auto';
  if (mime === 'application/pdf') return 'image';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/') || mime.startsWith('audio/')) return 'video';
  return 'raw';
}

function uploadBuffer(buffer, { folder = 'wati_panel', filename, mime } = {}) {
  return new Promise((resolve, reject) => {
    const resource_type = resourceTypeOf(mime);
    // Sanitize filename for use as a Cloudinary public_id:
    // - drop the extension (Cloudinary adds it back)
    // - replace any non [A-Za-z0-9._-] with '_' so the resulting URL never has
    //   percent-encoded chars (Meta's template-upload regex rejects '%').
    const base = filename
      ? `${Date.now()}_${filename
          .replace(/\.[^.]+$/, '')
          .replace(/[^A-Za-z0-9._-]+/g, '_')
          .replace(/_+/g, '_')
          .replace(/^_+|_+$/g, '')
          || 'file'}`
      : undefined;
    const options = {
      folder,
      resource_type,
      public_id: base,
    };
    // For PDFs uploaded as image, pin the delivered format to pdf so the URL ends in .pdf
    // (otherwise Cloudinary may default to rendering the first page as jpg).
    if (mime === 'application/pdf') options.format = 'pdf';
    // Audio: browsers (esp. Chrome/Edge on Windows) record voice notes as
    // audio/webm;codecs=opus, which Meta's WhatsApp Cloud API does NOT accept.
    // Tell Cloudinary to transcode to MP3 on upload so the delivered URL ends
    // in .mp3 with Content-Type: audio/mpeg, which Meta accepts unconditionally.
    if (mime && mime.startsWith('audio/')) options.format = 'mp3';
    const stream = cloudinary.uploader.upload_stream(options,
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(buffer);
  });
}

// Build a Cloudinary URL that forces download via Content-Disposition: attachment.
// Works for any Cloudinary URL (image, video, raw).
function toDownloadUrl(url) {
  if (!url || typeof url !== 'string') return url;
  if (!url.includes('res.cloudinary.com')) return url;
  if (url.includes('/fl_attachment')) return url;
  return url.replace(/\/upload\//, '/upload/fl_attachment/');
}

// Given a Cloudinary secure_url, extract { publicId, resourceType }
// Example: https://res.cloudinary.com/<cloud>/image/upload/v1234/wati_panel/918106/123_file.jpg
//   -> { publicId: 'wati_panel/918106/123_file', resourceType: 'image' }
function parseCloudinaryUrl(url) {
  if (!url || typeof url !== 'string') return null;
  if (!url.includes('res.cloudinary.com')) return null;
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    // ["<cloud>", "<resourceType>", "upload", ...(maybe version), ...publicIdParts.ext]
    const rtIdx = parts.findIndex(p => ['image', 'video', 'raw'].includes(p));
    if (rtIdx === -1) return null;
    const resourceType = parts[rtIdx];
    // skip "upload" and optional version (v1234567)
    let i = rtIdx + 2;
    if (parts[i] && /^v\d+$/.test(parts[i])) i += 1;
    const rest = parts.slice(i).join('/');
    // strip extension only for images/videos - for raw we keep it (pdfs etc).
    const publicId = resourceType === 'raw'
      ? rest
      : rest.replace(/\.[^.]+$/, '');
    return { publicId: decodeURIComponent(publicId), resourceType };
  } catch { return null; }
}

async function deleteByUrl(url) {
  const parsed = parseCloudinaryUrl(url);
  if (!parsed) return { skipped: true };
  try {
    const res = await cloudinary.uploader.destroy(parsed.publicId, {
      resource_type: parsed.resourceType,
      invalidate: true,
    });
    return res;
  } catch (e) {
    console.error('[cloudinary deleteByUrl] failed', parsed, e.message);
    return { error: e.message };
  }
}

// Delete all resources in a given folder path and the folder itself.
// We have to delete per resource_type since Cloudinary separates them.
async function deleteFolder(folderPath) {
  if (!folderPath) return;
  const types = ['image', 'video', 'raw'];
  for (const t of types) {
    try {
      await cloudinary.api.delete_resources_by_prefix(folderPath, { resource_type: t, invalidate: true });
    } catch (e) {
      if (!/not found/i.test(e.message || '')) {
        console.error(`[cloudinary deleteFolder] ${t}`, e.message);
      }
    }
  }
  try { await cloudinary.api.delete_folder(folderPath); }
  catch (e) { /* folder may be empty or already gone */ }
}

module.exports = { cloudinary, upload, uploadBuffer, toDownloadUrl, parseCloudinaryUrl, deleteByUrl, deleteFolder };
