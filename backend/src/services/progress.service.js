const realtime = require('./realtime.publisher');

const STAGES = [
  'uploading',
  'preprocessing',
  'cloud_detection',
  'mask_generation',
  'running_ai',
  'generating_output',
  'saving_results',
  'completed',
];

function emitStage(userId, { experimentId, imageId, stage, message = null, progress = null }) {
  realtime.publish(`user:${userId}`, 'job:progress', {
    experimentId,
    imageId,
    stage,
    message,
    progress,
    timestamp: new Date().toISOString(),
  });
}

function emitFailure(userId, { experimentId, imageId, errorMessage }) {
  realtime.publish(`user:${userId}`, 'job:failed', {
    experimentId,
    imageId,
    errorMessage,
    timestamp: new Date().toISOString(),
  });
}

module.exports = { STAGES, emitStage, emitFailure };