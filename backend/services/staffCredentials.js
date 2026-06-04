const crypto = require('crypto');
const Setting = require('../models/Setting');

const STAFF_KEY = 'staffCredentials';
const HASH_ITERS = 120000;
const HASH_BYTES = 32;
const HASH_DIGEST = 'sha256';

function normalizeMobile(value) {
  return String(value || '').trim();
}

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, HASH_ITERS, HASH_BYTES, HASH_DIGEST).toString('hex');
}

async function getStaffCredentialsDoc() {
  return Setting.findOne({ key: STAFF_KEY }).lean();
}

async function setStaffCredentials({ mobile, password }) {
  const trimmedMobile = normalizeMobile(mobile);
  const trimmedPassword = String(password || '').trim();
  if (!trimmedMobile || !trimmedPassword) {
    return { error: 'Mobile number and password are required' };
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = hashPassword(trimmedPassword, salt);
  await Setting.put(STAFF_KEY, { mobile: trimmedMobile, passwordHash, salt });
  const doc = await getStaffCredentialsDoc();
  return {
    mobile: trimmedMobile,
    hasPassword: true,
    updatedAt: doc?.updatedAt || null,
  };
}

function verifyStaffCredentials({ mobile, password, doc }) {
  const staff = doc?.value || null;
  const staffMobile = normalizeMobile(staff?.mobile);
  const staffHash = staff?.passwordHash;
  const staffSalt = staff?.salt;
  const normalizedMobile = normalizeMobile(mobile);
  const normalizedPassword = String(password || '').trim();

  if (!staffMobile || !staffHash || !staffSalt) return false;
  if (!normalizedMobile || !normalizedPassword) return false;

  return (
    normalizedMobile === staffMobile &&
    hashPassword(normalizedPassword, staffSalt) === staffHash
  );
}

module.exports = {
  getStaffCredentialsDoc,
  setStaffCredentials,
  verifyStaffCredentials,
  normalizeMobile,
};
