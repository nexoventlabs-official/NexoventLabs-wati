const { signStaffToken } = require('../middleware/adminAuth');
const {
  getStaffCredentialsDoc,
  verifyStaffCredentials,
  normalizeMobile,
} = require('../services/staffCredentials');

// POST /api/staff/login  { mobile, password }  -> { token }
exports.login = async (req, res) => {
  const { mobile, password } = req.body || {};
  if (typeof mobile !== 'string' || typeof password !== 'string') {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const doc = await getStaffCredentialsDoc();
  const staff = doc?.value || null;
  if (!staff?.mobile || !staff?.passwordHash || !staff?.salt) {
    return res.status(401).json({ error: 'Staff credentials not set' });
  }

  const ok = verifyStaffCredentials({ mobile, password, doc });
  if (!ok) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const normalizedMobile = normalizeMobile(mobile);
  return res.json({
    token: signStaffToken(normalizedMobile),
    user: { mobile: normalizedMobile, role: 'staff' },
  });
};

// GET /api/staff/me   -> { ok: true, user }
exports.me = (req, res) => {
  res.json({ ok: true, user: { mobile: req.staff?.sub, role: 'staff' } });
};
