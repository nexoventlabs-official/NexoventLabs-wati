const router = require('express').Router();
const c = require('../controllers/contactController');

router.get('/', c.listContacts);
router.post('/', c.createContact);
router.get('/:id', c.getContact);
router.patch('/:id', c.updateContact);
router.post('/:id/read', c.markRead);
router.post('/:id/pin', c.togglePin);
router.post('/:id/notes', c.addNote);
router.delete('/:id/notes/:noteId', c.deleteNote);
router.delete('/:id/chat', c.clearChat);
router.delete('/:id', c.deleteContact);

module.exports = router;
