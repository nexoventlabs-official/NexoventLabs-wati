const router = require('express').Router();
const c = require('../controllers/welcomeController');
const { requireAdmin } = require('../middleware/adminAuth');

router.use(requireAdmin);

router.get('/', c.get);
router.patch('/', c.update);
router.put('/image/:slot', c.setImage);
router.delete('/image/:slot', c.removeImage);

module.exports = router;
