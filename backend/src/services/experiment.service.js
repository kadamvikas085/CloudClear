const Experiment = require('../models/Experiment.model');
const Image = require('../models/Image.model');
const Project = require('../models/Project.model');
const aiServiceClient = require('./aiService.client');
const { uploadBufferToCloudinary } = require('./upload.service');
const progressService = require('./progress.service');
const notificationService = require('./notification.service');
const { aiJobLogger } = require('../config/logger');

async function createQueuedExperiment({ image, project, modelUsed, ownerId }) {
  const experiment = await Experiment.create({
    project: project._id,
    owner: ownerId,
    sourceImage: image._id,
    modelUsed,
    status: 'queued',
  });

  image.status = 'processing';
  await image.save();

  progressService.emitStage(ownerId, {
    experimentId: experiment._id.toString(),
    imageId: image._id.toString(),
    stage: 'uploading',
    message: 'Job queued for processing',
  });

  return experiment;
}

async function runInferenceJob({ experimentId }) {
  const experiment = await Experiment.findById(experimentId);
  if (!experiment) {
    aiJobLogger.error({ experimentId }, 'runInferenceJob: experiment not found — dropping job');
    return;
  }

  const [image, project] = await Promise.all([
    Image.findById(experiment.sourceImage),
    Project.findById(experiment.project),
  ]);

  if (!image || !project) {
    experiment.status = 'failed';
    experiment.errorMessage = 'Source image or project no longer exists';
    await experiment.save();
    return;
  }

  const ownerId = experiment.owner.toString();
  const stageContext = { experimentId: experiment._id.toString(), imageId: image._id.toString() };

  experiment.status = 'running';
  await experiment.save();

  try {
    progressService.emitStage(ownerId, { ...stageContext, stage: 'preprocessing', message: 'Preparing image for the model' });
    progressService.emitStage(ownerId, { ...stageContext, stage: 'cloud_detection', message: 'Detecting cloud coverage' });
    progressService.emitStage(ownerId, { ...stageContext, stage: 'mask_generation', message: 'Generating cloud mask' });

    const startedAt = Date.now();

    progressService.emitStage(ownerId, { ...stageContext, stage: 'running_ai', message: `Running ${experiment.modelUsed} model` });

    const result = await aiServiceClient.requestInference({
      imageUrl: image.cloudinaryUrl,
      model: experiment.modelUsed,
      imageId: image._id.toString(),
    });

    progressService.emitStage(ownerId, { ...stageContext, stage: 'generating_output', message: 'Generating reconstructed output' });

    const processedBuffer = Buffer.from(result.processedImageBase64, 'base64');
    const confidenceBuffer = Buffer.from(result.confidenceMapBase64, 'base64');

    const [processedUpload, confidenceUpload] = await Promise.all([
      uploadBufferToCloudinary(processedBuffer, {
        folder: `cloudvision/projects/${project._id}/experiments`,
        resourceType: 'image',
      }),
      uploadBufferToCloudinary(confidenceBuffer, {
        folder: `cloudvision/projects/${project._id}/experiments/confidence-maps`,
        resourceType: 'image',
      }),
    ]);

    progressService.emitStage(ownerId, { ...stageContext, stage: 'saving_results', message: 'Saving results' });

    const metrics = result.metrics || {};
    const processingTimeMs = metrics.processingTimeMs ?? Date.now() - startedAt;

    experiment.processedImageUrl = processedUpload.secure_url;
    experiment.processedImagePublicId = processedUpload.public_id;
    experiment.confidenceMapUrl = confidenceUpload.secure_url;
    experiment.confidenceMapPublicId = confidenceUpload.public_id;
    experiment.processingTimeMs = processingTimeMs;
    experiment.psnr = metrics.psnr ?? null;
    experiment.ssim = metrics.ssim ?? null;
    experiment.iou = metrics.iou ?? null;
    experiment.rmse = metrics.rmse ?? null;
    experiment.mae = metrics.mae ?? null;
    experiment.confidenceScore = metrics.confidenceScore ?? null;
    experiment.status = 'completed';
    await experiment.save();

    image.status = 'processed';
    await image.save();

    await Project.updateOne({ _id: project._id }, { $inc: { experimentCount: 1 } });

    progressService.emitStage(ownerId, { ...stageContext, stage: 'completed', message: 'Processing completed' });

    notificationService
      .createNotification({
        userId: ownerId,
        type: 'processing_completed',
        title: 'Processing completed',
        message: `Your ${experiment.modelUsed} reconstruction for "${image.originalFileName}" is ready.`,
        meta: { projectId: project._id.toString(), imageId: image._id.toString(), experimentId: experiment._id.toString() },
      })
      .catch(() => {});
  } catch (err) {
    aiJobLogger.error({ err, imageId: image._id, modelUsed: experiment.modelUsed }, 'AI inference failed');

    experiment.status = 'failed';
    experiment.errorMessage = err.message;
    await experiment.save();

    image.status = 'failed';
    await image.save();

    progressService.emitFailure(ownerId, { ...stageContext, errorMessage: err.message });

    notificationService
      .createNotification({
        userId: ownerId,
        type: 'processing_failed',
        title: 'Processing failed',
        message: `AI processing failed for "${image.originalFileName}". Please try again.`,
        meta: { projectId: project._id.toString(), imageId: image._id.toString(), experimentId: experiment._id.toString() },
      })
      .catch(() => {});

    throw err;
  }
}

module.exports = { createQueuedExperiment, runInferenceJob };