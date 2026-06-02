const router = require('express').Router();
const c = require('../controllers/flowImageController');
const { requireAdmin } = require('../middleware/adminAuth');

router.use(requireAdmin);

router.get('/', c.list);
router.put('/:key', c.set);
router.delete('/:key', c.remove);

module.exports = router;
