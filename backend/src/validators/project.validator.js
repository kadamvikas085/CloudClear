const { body, query, param } = require('express-validator');

const createProjectValidator = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Project name is required')
    .isLength({ min: 2, max: 150 })
    .withMessage('Project name must be between 2 and 150 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Description must be under 2000 characters'),
  body('region').optional().trim().isLength({ max: 200 }),
];

const updateProjectValidator = [
  param('id').isMongoId().withMessage('Invalid project id'),
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 150 })
    .withMessage('Project name must be between 2 and 150 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Description must be under 2000 characters'),
  body('region').optional().trim().isLength({ max: 200 }),
  body('status').optional().isIn(['active', 'archived']).withMessage('Invalid status value'),
];

const projectIdValidator = [param('id').isMongoId().withMessage('Invalid project id')];

const listProjectsValidator = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('status').optional().isIn(['active', 'archived']).withMessage('Invalid status value'),
  query('search').optional().trim().isLength({ max: 150 }),
];

module.exports = {
  createProjectValidator,
  updateProjectValidator,
  projectIdValidator,
  listProjectsValidator,
};
