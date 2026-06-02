const router = require('express').Router();
const c = require('../controllers/flowController');
const { requireAdmin } = require('../middleware/adminAuth');

router.use(requireAdmin);

router.get('/status', c.status);
router.post('/publish', c.publish);

module.exports = router;
