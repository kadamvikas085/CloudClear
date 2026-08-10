const { query, param } = require('express-validator');

const listNotificationsValidator = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('isRead').optional().isBoolean().withMessage('isRead must be true or false'),
];

const notificationIdValidator = [param('id').isMongoId().withMessage('Invalid notification id')];

module.exports = { listNotificationsValidator, notificationIdValidator };