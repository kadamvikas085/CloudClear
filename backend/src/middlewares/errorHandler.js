const mongoose = require('mongoose');
const { ApiError } = require('../utils/ApiError');
const { logger } = require('../config/logger');
const config = require('../config/env');

function normalizeError(err) {
  if (err instanceof ApiError) return err;

  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map((e) => e.message);
    return new ApiError(422, 'Validation failed', details);
  }

  if (err instanceof mongoose.Error.CastError) {
    return new ApiError(400, `Invalid value for field '${err.path}'`);
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0];
    return new ApiError(409, `${field ? `${field} already exists` : 'Duplicate value'}`);
  }

  if (err.name === 'JsonWebTokenError') {
    return new ApiError(401, 'Invalid authentication token');
  }
  if (err.name === 'TokenExpiredError') {
    return new ApiError(401, 'Authentication token has expired');
  }

  if (err.name === 'MulterError') {
    return new ApiError(400, `File upload error: ${err.message}`);
  }

  return new ApiError(500, 'Something went wrong on the server', null, false);
}

// eslint-disable-next-line no-unused-vars
function globalErrorHandler(err, req, res, next) {
  const normalized = normalizeError(err);

  const logPayload = {
    err,
    statusCode: normalized.statusCode,
    path: req.originalUrl,
    method: req.method,
    userId: req.user?.id,
    requestId: req.id,
  };

  if (normalized.statusCode >= 500) {
    logger.error(logPayload, 'Unhandled server error');
  } else {
    logger.warn(logPayload, 'Handled client error');
  }

  res.status(normalized.statusCode).json({
    success: false,
    statusCode: normalized.statusCode,
    message: normalized.message,
    details: normalized.details || undefined,
    stack: config.isProduction ? undefined : err.stack,
  });
}

module.exports = globalErrorHandler;