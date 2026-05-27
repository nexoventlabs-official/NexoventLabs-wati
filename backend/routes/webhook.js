const router = require('express').Router();
const c = require('../controllers/webhookController');

router.get('/', c.verify);
router.post('/', c.receive);

module.exports = router;
