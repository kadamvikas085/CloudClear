const { Redis } = require('ioredis');
const config = require('./env');
const { logger } = require('./logger');

function createRedisConnection(overrides = {}) {
  const client = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    ...overrides,
  });

  client.on('connect', () => logger.info('[Redis] connection established'));
  client.on('error', (err) => logger.error({ err }, '[Redis] connection error'));

  return client;
}

const redisClient = createRedisConnection();

module.exports = { createRedisConnection, redisClient };