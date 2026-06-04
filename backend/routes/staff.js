const router = require('express').Router();
const s = require('../controllers/staffController');
const { requireStaff } = require('../middleware/adminAuth');

// Public: login
router.post('/login', s.login);

// Everything below requires a valid staff JWT.
router.use(requireStaff);
router.get('/me', s.me);

module.exports = router;
