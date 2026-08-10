const { validationResult } = require('express-validator');
const { ValidationError } = require('../utils/ApiError');

function validate(req, res, next) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();

  const details = errors.array().map((e) => ({ field: e.path, message: e.msg }));
  next(new ValidationError('Validation failed', details));
}

module.exports = validate;