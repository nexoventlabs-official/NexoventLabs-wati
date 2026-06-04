const router = require('express').Router();
const a = require('../controllers/adminController');
const { requireAdmin } = require('../middleware/adminAuth');

// Public: login
router.post('/login', a.login);

// Everything below requires a valid admin JWT.
router.use(requireAdmin);

router.get('/me', a.me);
router.get('/staff-credentials', a.getStaffCredentials);
router.put('/staff-credentials', a.updateStaffCredentials);
router.get('/contacts', a.listContacts);
router.get('/contacts/:id', a.getContact);
router.get('/report', a.downloadReport);

module.exports = router;
