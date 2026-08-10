const { body, query, param } = require('express-validator');

const uploadImageValidator = [
  body('projectId').isMongoId().withMessage('A valid projectId is required'),
];

const listImagesValidator = [
  query('projectId').isMongoId().withMessage('A valid projectId is required'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('status')
    .optional()
    .isIn(['uploaded', 'processing', 'processed', 'failed'])
    .withMessage('Invalid status value'),
];

const imageIdValidator = [param('id').isMongoId().withMessage('Invalid image id')];

module.exports = { uploadImageValidator, listImagesValidator, imageIdValidator };