const experimentService = require('../services/experiment.service');
const { aiJobLogger } = require('../config/logger');

async function processAiJob(job) {
  const { experimentId } = job.data;
  aiJobLogger.info({ jobId: job.id, experimentId }, 'Starting AI processing job');
  await experimentService.runInferenceJob({ experimentId });
  aiJobLogger.info({ jobId: job.id, experimentId }, 'AI processing job finished');
}

module.exports = processAiJob;