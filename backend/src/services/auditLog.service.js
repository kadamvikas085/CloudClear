const AuditLog = require('../models/AuditLog.model');
const { logger } = require('../config/logger');

async function logAction({ userId = null, action, description, ip = null, userAgent = null, meta = {} }) {
  try {
    await AuditLog.create({ user: userId, action, description, ip, userAgent, meta });
  } catch (err) {
    logger.warn({ err: err.message, action }, '[AuditLog] Failed to write audit log entry');
  }
}

module.exports = { logAction };