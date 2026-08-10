class ApiError extends Error {
  constructor(statusCode, message, details = null, isOperational = true) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

class BadRequestError extends ApiError {
  constructor(message = 'Bad request', details = null) {
    super(400, message, details);
  }
}

class UnauthorizedError extends ApiError {
  constructor(message = 'Unauthorized', details = null) {
    super(401, message, details);
  }
}

class ForbiddenError extends ApiError {
  constructor(message = 'Forbidden', details = null) {
    super(403, message, details);
  }
}

class NotFoundError extends ApiError {
  constructor(message = 'Resource not found', details = null) {
    super(404, message, details);
  }
}

class ConflictError extends ApiError {
  constructor(message = 'Conflict', details = null) {
    super(409, message, details);
  }
}

class ValidationError extends ApiError {
  constructor(message = 'Validation failed', details = null) {
    super(422, message, details);
  }
}

class TooManyRequestsError extends ApiError {
  constructor(message = 'Too many requests') {
    super(429, message);
  }
}

class InternalServerError extends ApiError {
  constructor(message = 'Internal server error', details = null) {
    super(500, message, details, false);
  }
}

class ServiceUnavailableError extends ApiError {
  constructor(message = 'Upstream service unavailable', details = null) {
    super(503, message, details);
  }
}

module.exports = {
  ApiError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  TooManyRequestsError,
  InternalServerError,
  ServiceUnavailableError,
};