const express = require('express');

const experimentController = require('../controllers/experiment.controller');
const validate = require('../middlewares/validate');
const { protect } = require('../middlewares/auth.middleware');
const { processImageValidator } = require('../validators/experiment.validator');
const {
  listExperimentsValidator,
  experimentIdValidator,
} = require('../validators/experimentHistory.validator');

const router = express.Router();

router.use(protect);

router.post('/process', processImageValidator, validate, experimentController.processImage);
router.get('/', listExperimentsValidator, validate, experimentController.listExperiments);
router.get('/:id', experimentIdValidator, validate, experimentController.getExperiment);

module.exports = router;