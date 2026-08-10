const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config/env');
const RefreshToken = require('../models/RefreshToken.model');

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function signAccessToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), role: user.role },
    config.jwt.accessSecret,
    { expiresIn: config.jwt.accessExpires }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, config.jwt.accessSecret);
}

async function issueRefreshToken(user, { userAgent, ip } = {}) {
  const rawToken = crypto.randomBytes(40).toString('hex');
  const tokenHash = hashToken(rawToken);

  const expiresAt = new Date(Date.now() + msFromDuration(config.jwt.refreshExpires));

  await RefreshToken.create({
    user: user._id,
    tokenHash,
    expiresAt,
    userAgent,
    ip,
  });

  return { rawToken, expiresAt };
}

async function rotateRefreshToken(rawToken, { userAgent, ip } = {}) {
  const tokenHash = hashToken(rawToken);
  const existing = await RefreshToken.findOne({ tokenHash });

  if (!existing) {
    throw new Error('REFRESH_TOKEN_NOT_FOUND');
  }

  if (existing.revoked || existing.expiresAt <= new Date()) {
    throw new Error('REFRESH_TOKEN_INVALID');
  }

  const newRawToken = crypto.randomBytes(40).toString('hex');
  const newTokenHash = hashToken(newRawToken);
  const expiresAt = new Date(Date.now() + msFromDuration(config.jwt.refreshExpires));

  existing.revoked = true;
  existing.revokedAt = new Date();
  existing.replacedByTokenHash = newTokenHash;
  await existing.save();

  await RefreshToken.create({
    user: existing.user,
    tokenHash: newTokenHash,
    expiresAt,
    userAgent,
    ip,
  });

  return { newRawToken, userId: existing.user, expiresAt };
}

async function revokeRefreshToken(rawToken) {
  const tokenHash = hashToken(rawToken);
  await RefreshToken.updateOne(
    { tokenHash },
    { revoked: true, revokedAt: new Date() }
  );
}

async function revokeAllUserTokens(userId) {
  await RefreshToken.updateMany(
    { user: userId, revoked: false },
    { revoked: true, revokedAt: new Date() }
  );
}

function msFromDuration(duration) {
  const match = /^(\d+)([smhd])$/.exec(duration);
  if (!match) {
    const asNumber = Number(duration);
    return Number.isNaN(asNumber) ? 7 * 24 * 60 * 60 * 1000 : asNumber * 1000;
  }
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const unitMs = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };
  return value * unitMs[unit];
}

module.exports = {
  hashToken,
  signAccessToken,
  verifyAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  msFromDuration,
};