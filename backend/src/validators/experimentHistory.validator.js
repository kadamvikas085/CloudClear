const { query, param } = require('express-validator');

const listExperimentsValidator = [
  query('projectId').optional().isMongoId().withMessage('Invalid projectId'),
  query('model')
    .optional()
    .isIn(['GAN', 'Diffusion', 'LaMa', 'U-Net'])
    .withMessage('Invalid model value'),
  query('status')
    .optional()
    .isIn(['queued', 'running', 'completed', 'failed'])
    .withMessage('Invalid status value'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('sortBy')
    .optional()
    .isIn(['createdAt', 'psnr', 'ssim', 'processingTimeMs'])
    .withMessage('Invalid sortBy value'),
  query('order').optional().isIn(['asc', 'desc']).withMessage('Order must be asc or desc'),
];

const experimentIdValidator = [param('id').isMongoId().withMessage('Invalid experiment id')];

module.exports = { listExperimentsValidator, experimentIdValidator };