const { query, param } = require('express-validator');

const listUsersValidator = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('role').optional().isIn(['user', 'admin']).withMessage('Invalid role value'),
  query('isActive').optional().isBoolean().withMessage('isActive must be true or false'),
  query('search').optional().trim().isLength({ max: 150 }),
];

const userIdValidator = [param('id').isMongoId().withMessage('Invalid user id')];

const listLogsValidator = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('action').optional().trim().isLength({ max: 100 }),
  query('userId').optional().isMongoId().withMessage('Invalid userId'),
];

module.exports = { listUsersValidator, userIdValidator, listLogsValidator };