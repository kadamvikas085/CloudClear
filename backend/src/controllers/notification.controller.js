const Notification = require('../models/Notification.model');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const { NotFoundError, ForbiddenError } = require('../utils/ApiError');

const listNotifications = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  const filter = { user: req.user.id };
  if (req.query.isRead !== undefined) {
    filter.isRead = req.query.isRead === 'true';
  }

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Notification.countDocuments(filter),
    Notification.countDocuments({ user: req.user.id, isRead: false }),
  ]);

  return new ApiResponse(200, 'Notifications fetched successfully', { notifications, unreadCount }, {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  }).send(res);
});

const markAsRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findById(req.params.id);
  if (!notification) throw new NotFoundError('Notification not found');
  if (notification.user.toString() !== req.user.id) {
    throw new ForbiddenError('You do not have access to this notification');
  }

  notification.isRead = true;
  await notification.save();

  return new ApiResponse(200, 'Notification marked as read', { notification }).send(res);
});

const markAllAsRead = asyncHandler(async (req, res) => {
  await Notification.updateMany({ user: req.user.id, isRead: false }, { isRead: true });
  return new ApiResponse(200, 'All notifications marked as read').send(res);
});

const deleteNotification = asyncHandler(async (req, res) => {
  const notification = await Notification.findById(req.params.id);
  if (!notification) throw new NotFoundError('Notification not found');
  if (notification.user.toString() !== req.user.id) {
    throw new ForbiddenError('You do not have access to this notification');
  }

  await notification.deleteOne();
  return new ApiResponse(200, 'Notification deleted successfully').send(res);
});

module.exports = { listNotifications, markAsRead, markAllAsRead, deleteNotification };