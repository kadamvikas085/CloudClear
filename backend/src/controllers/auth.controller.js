const crypto = require('crypto');
const User = require('../models/User.model');
const tokenService = require('../services/token.service');
const { enqueueVerificationEmail, enqueuePasswordResetEmail } = require('../queues/email.queue');
const auditLogService = require('../services/auditLog.service');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const {
  BadRequestError,
  UnauthorizedError,
  ConflictError,
} = require('../utils/ApiError');
const config = require('../config/env');

const REFRESH_COOKIE_NAME = 'refreshToken';

function refreshCookieOptions(expiresAt) {
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: config.isProduction ? 'none' : 'lax',
    expires: expiresAt,
    path: '/api/v1/auth',
  };
}

const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  const existing = await User.findOne({ email });
  if (existing) {
    throw new ConflictError('An account with this email already exists');
  }

  const user = await User.create({ name, email, password });

  const rawVerificationToken = user.createEmailVerificationToken();
  await user.save({ validateBeforeSave: false });

  enqueueVerificationEmail({ email: user.email, name: user.name, rawToken: rawVerificationToken }).catch(() => {});

  return new ApiResponse(201, 'Registration successful. Please verify your email.', {
    user: user.toSafeJSON(),
  }).send(res);
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    auditLogService
      .logAction({
        userId: user?._id || null,
        action: 'login_failed',
        description: `Failed login attempt for ${email}`,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      })
      .catch(() => {});
    throw new UnauthorizedError('Invalid email or password');
  }

  if (!user.isActive) {
    throw new UnauthorizedError('This account has been deactivated');
  }

  const accessToken = tokenService.signAccessToken(user);
  const { rawToken: refreshToken, expiresAt } = await tokenService.issueRefreshToken(user, {
    userAgent: req.headers['user-agent'],
    ip: req.ip,
  });

  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  auditLogService
    .logAction({
      userId: user._id,
      action: 'login_success',
      description: `${user.email} logged in`,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    })
    .catch(() => {});

  res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions(expiresAt));

  return new ApiResponse(200, 'Login successful', {
    user: user.toSafeJSON(),
    accessToken,
  }).send(res);
});

const logout = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
  if (refreshToken) {
    await tokenService.revokeRefreshToken(refreshToken);
  }
  res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/v1/auth' });
  return new ApiResponse(200, 'Logged out successfully').send(res);
});

const refresh = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
  if (!refreshToken) {
    throw new UnauthorizedError('No refresh token provided');
  }

  let rotation;
  try {
    rotation = await tokenService.rotateRefreshToken(refreshToken, {
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
  } catch (err) {
    res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/v1/auth' });
    throw new UnauthorizedError('Session expired or invalid. Please log in again.');
  }

  const user = await User.findById(rotation.userId);
  if (!user || !user.isActive) {
    throw new UnauthorizedError('Account no longer available');
  }

  const accessToken = tokenService.signAccessToken(user);

  res.cookie(
    REFRESH_COOKIE_NAME,
    rotation.newRawToken,
    refreshCookieOptions(rotation.expiresAt)
  );

  return new ApiResponse(200, 'Token refreshed', { accessToken }).send(res);
});

const verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.body;
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  const user = await User.findOne({
    emailVerificationToken: hashedToken,
    emailVerificationExpires: { $gt: Date.now() },
  }).select('+emailVerificationToken +emailVerificationExpires');

  if (!user) {
    throw new BadRequestError('Verification link is invalid or has expired');
  }

  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;
  await user.save({ validateBeforeSave: false });

  return new ApiResponse(200, 'Email verified successfully').send(res);
});

const resendVerification = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });

  if (user && !user.isEmailVerified) {
    const rawToken = user.createEmailVerificationToken();
    await user.save({ validateBeforeSave: false });
    enqueueVerificationEmail({ email: user.email, name: user.name, rawToken }).catch(() => {});
  }

  return new ApiResponse(200, 'If an account exists, a verification email has been sent').send(res);
});

const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });

  if (user) {
    const rawToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });
    enqueuePasswordResetEmail({ email: user.email, name: user.name, rawToken }).catch(() => {});
  }

  return new ApiResponse(200, 'If an account exists, a password reset email has been sent').send(res);
});

const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  }).select('+passwordResetToken +passwordResetExpires');

  if (!user) {
    throw new BadRequestError('Reset link is invalid or has expired');
  }

  user.password = password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  await tokenService.revokeAllUserTokens(user._id);

  return new ApiResponse(200, 'Password reset successful. Please log in again.').send(res);
});

const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  return new ApiResponse(200, 'Current user fetched', { user: user.toSafeJSON() }).send(res);
});

module.exports = {
  register,
  login,
  logout,
  refresh,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  getMe,
};