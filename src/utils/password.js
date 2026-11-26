const crypto = require('node:crypto');

const KEY_LENGTH = 64;

/**
 * Hashes a plaintext password using scrypt with a random 16-byte salt.
 * @param {string} password
 * @returns {string}
 */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto
    .scryptSync(password, salt, KEY_LENGTH)
    .toString('hex');

  return `scrypt$${salt}$${derivedKey}`;
}

/**
 * Verifies a plaintext password against a stored scrypt hash.
 * @param {string} password
 * @param {string} storedHash
 * @returns {boolean}
 */
function verifyPassword(password, storedHash) {
  if (typeof password !== 'string' || typeof storedHash !== 'string') {
    return false;
  }

  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }

  const [, salt, keyHex] = parts;
  if (!salt || !keyHex) {
    return false;
  }

  const expectedKey = Buffer.from(keyHex, 'hex');
  if (expectedKey.length === 0) {
    return false;
  }

  const derivedKey = crypto.scryptSync(password, salt, expectedKey.length);
  return crypto.timingSafeEqual(expectedKey, derivedKey);
}

module.exports = {
  hashPassword,
  verifyPassword,
};
