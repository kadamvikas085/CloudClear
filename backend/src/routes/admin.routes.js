const express = require('express');

const adminController = require('../controllers/admin.controller');
const validate = require('../middlewares/validate');
const { protect, authorize } = require('../middlewares/auth.middleware');
const {
  listUsersValidator,
  userIdValidator,
  listLogsValidator,
} = require('../validators/admin.validator');

const router = express.Router();

router.use(protect, authorize('admin'));

router.get('/users', listUsersValidator, validate, adminController.listUsers);
router.delete('/users/:id', userIdValidator, validate, adminController.deleteUser);

router.get('/storage', adminController.viewStorage);
router.get('/jobs', adminController.viewJobs);
router.get('/logs', listLogsValidator, validate, adminController.viewLogs);
router.get('/ai-statistics', adminController.viewAiStatistics);

module.exports = router;