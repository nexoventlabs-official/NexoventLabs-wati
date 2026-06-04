const jwt = require('jsonwebtoken');

// JWT-based admin auth. The signing secret comes from env (JWT_SECRET); a
// hard fallback ('change-me-in-prod') is used only when the var is missing
// so local dev still boots, but production deployments MUST set their own.
function getSecret() {
  return process.env.JWT_SECRET || 'change-me-in-prod';
}

// Sign a JWT for the admin user. The payload is intentionally tiny - the
// only claim we care about is `role: 'admin'`. Tokens are valid for 12h.
function signAdminToken(username) {
  return jwt.sign(
    { sub: username, role: 'admin' },
    getSecret(),
    { expiresIn: '12h' }
  );
}

// Sign a JWT for staff logins.
function signStaffToken(mobile) {
  return jwt.sign(
    { sub: mobile, role: 'staff' },
    getSecret(),
    { expiresIn: '12h' }
  );
}

// Express middleware. Rejects with 401 if the request does not present a
// valid `Authorization: Bearer <jwt>` header signed with our secret AND
// carrying `role: 'admin'`.
function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!m) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(m[1], getSecret());
    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    req.admin = decoded;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Express middleware for staff-only routes.
function requireStaff(req, res, next) {
  const header = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!m) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(m[1], getSecret());
    if (decoded.role !== 'staff') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    req.staff = decoded;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { signAdminToken, signStaffToken, requireAdmin, requireStaff };
