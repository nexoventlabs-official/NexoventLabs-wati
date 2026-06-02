const router = require('express').Router();
const c = require('../controllers/welcomeController');
const { requireAdmin } = require('../middleware/adminAuth');

router.use(requireAdmin);

router.get('/', c.get);
router.patch('/', c.update);
router.put('/image/:slot', c.setImage);
router.delete('/image/:slot', c.removeImage);
router.post('/template/submit', c.submitTemplate);
router.post('/template/refresh', c.refreshTemplate);
router.post('/template/send', c.sendTemplate);

module.exports = router;
