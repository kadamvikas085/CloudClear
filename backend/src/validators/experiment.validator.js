const { body, param } = require('express-validator');

const AI_MODELS = ['GAN', 'Diffusion', 'LaMa', 'U-Net'];

const processImageValidator = [
  body('imageId').isMongoId().withMessage('A valid imageId is required'),
  body('model').isIn(AI_MODELS).withMessage(`Model must be one of: ${AI_MODELS.join(', ')}`),
];

const experimentIdValidator = [param('id').isMongoId().withMessage('Invalid experiment id')];

module.exports = { processImageValidator, experimentIdValidator, AI_MODELS };