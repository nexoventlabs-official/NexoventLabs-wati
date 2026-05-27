const router = require('express').Router();
const c = require('../controllers/templateController');

router.get('/', c.listTemplates);
router.post('/sync', c.syncTemplates);
router.post('/', c.createTemplate);
router.post('/:id/submit', c.submitTemplate);
router.post('/:id/refresh', c.refreshTemplate);
router.patch('/:id/replies', c.updateButtonReplies);
router.delete('/:id', c.deleteTemplate);

module.exports = router;
