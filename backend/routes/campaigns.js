const router = require('express').Router();
const c = require('../controllers/campaignController');
const { requireAdmin } = require('../middleware/adminAuth');

router.use(requireAdmin);

router.get('/', c.list);
router.post('/', c.add);
router.post('/delete-many', c.removeMany);
router.delete('/:id', c.remove);
router.post('/send', c.send);
router.post('/schedule', c.scheduleSend);
router.post('/cancel-schedule', c.cancelSchedule);

module.exports = router;
