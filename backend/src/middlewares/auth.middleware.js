const User = require('../models/User.model');
const { verifyAccessToken } = require('../services/token.service');
const { UnauthorizedError, ForbiddenError } = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const protect = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Authentication required. Please log in.');
  }

  const token = authHeader.split(' ')[1];
  const decoded = verifyAccessToken(token);

  const user = await User.findById(decoded.sub).select('+passwordChangedAt');
  if (!user) {
    throw new UnauthorizedError('The user belonging to this token no longer exists');
  }

  if (!user.isActive) {
    throw new UnauthorizedError('This account has been deactivated');
  }

  if (user.changedPasswordAfter(decoded.iat)) {
    throw new UnauthorizedError('Password was changed recently. Please log in again.');
  }

  req.user = { id: user._id.toString(), role: user.role, email: user.email };
  next();
});

function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return next(new ForbiddenError('You do not have permission to perform this action'));
    }
    next();
  };
}

module.exports = { protect, authorize };