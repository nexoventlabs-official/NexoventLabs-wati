const router = require('express').Router();
const { upload, uploadBuffer } = require('../config/cloudinary');

router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    // Optional waId: group uploads under wati_panel/<waId>/ so we can bulk-delete on clear-chat
    const rawWaId = (req.body.waId || req.query.waId || '').toString().replace(/\D/g, '');
    const folder = rawWaId ? `wati_panel/${rawWaId}` : 'wati_panel/misc';
    const result = await uploadBuffer(req.file.buffer, {
      folder,
      filename: req.file.originalname,
      mime: req.file.mimetype,
    });
    res.json({
      url: result.secure_url,
      public_id: result.public_id,
      mimetype: req.file.mimetype,
      size: req.file.size,
      originalname: req.file.originalname,
    });
  } catch (err) {
    console.error('[upload]', err.message);
    res.status(500).json({ error: 'Upload failed', details: err.message });
  }
});

module.exports = router;
