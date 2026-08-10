const { Queue } = require('bullmq');
const { createRedisConnection } = require('../config/redis');

const QUEUE_NAME = 'ai-processing';

const aiProcessingQueue = new Queue(QUEUE_NAME, {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 7 * 24 * 60 * 60, count: 1000 },
    removeOnFail: { age: 30 * 24 * 60 * 60 },
  },
});

async function enqueueInferenceJob(experimentId) {
  return aiProcessingQueue.add(
    'process-image',
    { experimentId },
    { jobId: experimentId }
  );
}

module.exports = { aiProcessingQueue, enqueueInferenceJob, QUEUE_NAME };