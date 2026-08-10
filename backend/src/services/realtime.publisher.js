const { createRedisConnection } = require('../config/redis');
const { logger } = require('../config/logger');

const CHANNEL = 'realtime-events';
const publisher = createRedisConnection();

function publish(room, event, payload) {
  const message = JSON.stringify({ room, event, payload });
  publisher.publish(CHANNEL, message).catch((err) => {
    logger.warn({ err: err.message, room, event }, '[Realtime] Failed to publish event');
  });
}

module.exports = { publish, CHANNEL };