const router = require('express').Router();
const c = require('../controllers/messageController');

router.get('/:contactId', c.listMessages);
router.post('/:contactId/text', c.sendText);
router.post('/:contactId/media', c.sendMedia);
router.post('/:contactId/reaction', c.sendReaction);
router.post('/:contactId/template', c.sendTemplate);
router.delete('/:id', c.deleteMessage);

module.exports = router;
