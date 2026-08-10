const { Queue } = require('bullmq');
const { createRedisConnection } = require('../config/redis');

const QUEUE_NAME = 'email';

const emailQueue = new Queue(QUEUE_NAME, {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 10000 },
    removeOnComplete: { age: 24 * 60 * 60 },
    removeOnFail: { age: 7 * 24 * 60 * 60 },
  },
});

async function enqueueVerificationEmail({ email, name, rawToken }) {
  return emailQueue.add('verification', { type: 'verification', email, name, rawToken });
}

async function enqueuePasswordResetEmail({ email, name, rawToken }) {
  return emailQueue.add('password-reset', { type: 'password-reset', email, name, rawToken });
}

module.exports = { emailQueue, QUEUE_NAME, enqueueVerificationEmail, enqueuePasswordResetEmail };