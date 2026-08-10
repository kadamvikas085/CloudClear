const express = require('express');

const notificationController = require('../controllers/notification.controller');
const validate = require('../middlewares/validate');
const { protect } = require('../middlewares/auth.middleware');
const {
  listNotificationsValidator,
  notificationIdValidator,
} = require('../validators/notification.validator');

const router = express.Router();

router.use(protect);

router.get('/', listNotificationsValidator, validate, notificationController.listNotifications);
router.patch('/read-all', notificationController.markAllAsRead);
router.patch('/:id/read', notificationIdValidator, validate, notificationController.markAsRead);
router.delete('/:id', notificationIdValidator, validate, notificationController.deleteNotification);

module.exports = router;