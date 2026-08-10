const { Worker } = require('bullmq');
const { connectDB, disconnectDB } = require('./config/db');
const { createRedisConnection } = require('./config/redis');
const { logger } = require('./config/logger');
const config = require('./config/env');

const { QUEUE_NAME: AI_QUEUE_NAME } = require('./queues/aiProcessing.queue');
const { QUEUE_NAME: EMAIL_QUEUE_NAME } = require('./queues/email.queue');
const processAiJob = require('./jobs/aiProcessing.job');
const processEmailJob = require('./jobs/email.job');

let aiWorker;
let emailWorker;

async function start() {
  await connectDB();

  aiWorker = new Worker(AI_QUEUE_NAME, processAiJob, {
    connection: createRedisConnection(),
    concurrency: 2,
  });

  emailWorker = new Worker(EMAIL_QUEUE_NAME, processEmailJob, {
    connection: createRedisConnection(),
    concurrency: 5,
  });

  aiWorker.on('completed', (job) => {
    logger.info({ jobId: job.id }, `[Worker] ${AI_QUEUE_NAME} job completed`);
  });
  aiWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, `[Worker] ${AI_QUEUE_NAME} job failed`);
  });

  emailWorker.on('completed', (job) => {
    logger.info({ jobId: job.id }, `[Worker] ${EMAIL_QUEUE_NAME} job completed`);
  });
  emailWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, `[Worker] ${EMAIL_QUEUE_NAME} job failed`);
  });

  logger.info(`CloudVision AI worker process started (env: ${config.env})`);
}

async function gracefulShutdown(exitCode) {
  logger.info('Worker shutting down gracefully...');
  await Promise.all([aiWorker?.close(), emailWorker?.close()]);
  await disconnectDB();
  process.exit(exitCode);
}

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'UNHANDLED PROMISE REJECTION in worker — shutting down');
  gracefulShutdown(1);
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'UNCAUGHT EXCEPTION in worker — shutting down');
  gracefulShutdown(1);
});

['SIGTERM', 'SIGINT'].forEach((signal) => {
  process.on(signal, () => {
    logger.info(`${signal} received in worker`);
    gracefulShutdown(0);
  });
});

start().catch((err) => {
  logger.fatal({ err }, 'Failed to start worker process');
  process.exit(1);
});