const User = require('../models/User.model');
const tokenService = require('../services/token.service');
const { uploadBufferToCloudinary, deleteFromCloudinary } = require('../services/upload.service');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const { BadRequestError, UnauthorizedError } = require('../utils/ApiError');

const updateProfile = asyncHandler(async (req, res) => {
  const { name } = req.body;

  const user = await User.findById(req.user.id);
  if (name) user.name = name;
  await user.save();

  return new ApiResponse(200, 'Profile updated successfully', { user: user.toSafeJSON() }).send(res);
});

const updateAvatar = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new BadRequestError('No avatar file was uploaded');
  }

  const user = await User.findById(req.user.id);

  if (user.avatarPublicId) {
    await deleteFromCloudinary(user.avatarPublicId);
  }

  const result = await uploadBufferToCloudinary(req.file.buffer, {
    folder: `cloudvision/avatars/${user._id}`,
    resourceType: 'image',
  });

  user.avatarUrl = result.secure_url;
  user.avatarPublicId = result.public_id;
  await user.save();

  return new ApiResponse(200, 'Avatar updated successfully', {
    avatarUrl: user.avatarUrl,
  }).send(res);
});

const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user.id).select('+password');
  if (!(await user.comparePassword(currentPassword))) {
    throw new UnauthorizedError('Current password is incorrect');
  }

  user.password = newPassword;
  await user.save();

  await tokenService.revokeAllUserTokens(user._id);

  return new ApiResponse(200, 'Password changed successfully. Please log in again.').send(res);
});

const deleteAccount = asyncHandler(async (req, res) => {
  const { password } = req.body;

  const user = await User.findById(req.user.id).select('+password');
  if (!(await user.comparePassword(password))) {
    throw new UnauthorizedError('Password is incorrect');
  }

  user.isActive = false;
  await user.save({ validateBeforeSave: false });

  await tokenService.revokeAllUserTokens(user._id);

  res.clearCookie('refreshToken', { path: '/api/v1/auth' });
  return new ApiResponse(200, 'Account deleted successfully').send(res);
});

module.exports = { updateProfile, updateAvatar, changePassword, deleteAccount };