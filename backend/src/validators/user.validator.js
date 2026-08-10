const { body } = require('express-validator');

const updateProfileValidator = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
];

const changePasswordValidator = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters')
    .matches(/\d/)
    .withMessage('New password must contain at least one number')
    .matches(/[A-Za-z]/)
    .withMessage('New password must contain at least one letter'),
];

const deleteAccountValidator = [
  body('password').notEmpty().withMessage('Password confirmation is required to delete your account'),
];

module.exports = { updateProfileValidator, changePasswordValidator, deleteAccountValidator };