const router = require('express').Router();
const c = require('../controllers/categoryController');
const { requireAdmin } = require('../middleware/adminAuth');

// All category management is admin-only. Image bytes are uploaded separately
// via /api/upload (which returns a Cloudinary URL) and passed here as JSON.
router.use(requireAdmin);

router.get('/', c.list);
router.get('/:id', c.get);
router.post('/', c.create);
router.patch('/:id', c.update);
router.delete('/:id', c.remove);
router.post('/:id/send-test', c.sendTest);

module.exports = router;
