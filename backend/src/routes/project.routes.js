const express = require('express');

const projectController = require('../controllers/project.controller');
const validate = require('../middlewares/validate');
const { protect } = require('../middlewares/auth.middleware');
const {
  createProjectValidator,
  updateProjectValidator,
  projectIdValidator,
  listProjectsValidator,
} = require('../validators/project.validator');

const router = express.Router();

router.use(protect);

router.post('/', createProjectValidator, validate, projectController.createProject);
router.get('/', listProjectsValidator, validate, projectController.listProjects);
router.get('/:id', projectIdValidator, validate, projectController.getProject);
router.patch('/:id', updateProjectValidator, validate, projectController.updateProject);
router.delete('/:id', projectIdValidator, validate, projectController.deleteProject);

module.exports = router;