const Notification = require('../models/Notification.model');
const realtime = require('./realtime.publisher');

async function createNotification({ userId, type, title, message, meta = {} }) {
  const notification = await Notification.create({ user: userId, type, title, message, meta });
  realtime.publish(`user:${userId}`, 'notification:new', notification);
  return notification;
}

module.exports = { createNotification };