const Image = require('../models/Image.model');
const Project = require('../models/Project.model');
const Experiment = require('../models/Experiment.model');
const experimentService = require('../services/experiment.service');
const { enqueueInferenceJob } = require('../queues/aiProcessing.queue');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const { NotFoundError, ForbiddenError } = require('../utils/ApiError');

const processImage = asyncHandler(async (req, res) => {
  const { imageId, model } = req.body;

  const image = await Image.findById(imageId);
  if (!image) throw new NotFoundError('Image not found');
  if (image.owner.toString() !== req.user.id && req.user.role !== 'admin') {
    throw new ForbiddenError('You do not have access to this image');
  }

  const project = await Project.findById(image.project);
  if (!project) throw new NotFoundError('Associated project not found');

  const experiment = await experimentService.createQueuedExperiment({
    image,
    project,
    modelUsed: model,
    ownerId: req.user.id,
  });

  await enqueueInferenceJob(experiment._id.toString());

  return new ApiResponse(202, 'AI processing job queued', { experiment }).send(res);
});

const listExperiments = asyncHandler(async (req, res) => {
  const { projectId, model, status, sortBy = 'createdAt', order = 'desc' } = req.query;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const skip = (page - 1) * limit;

  const filter = { owner: req.user.id };
  if (projectId) filter.project = projectId;
  if (model) filter.modelUsed = model;
  if (status) filter.status = status;

  const sort = { [sortBy]: order === 'asc' ? 1 : -1 };

  const [experiments, total] = await Promise.all([
    Experiment.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('sourceImage', 'originalFileName cloudinaryUrl fileType')
      .populate('project', 'name'),
    Experiment.countDocuments(filter),
  ]);

  return new ApiResponse(200, 'Experiment history fetched successfully', { experiments }, {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  }).send(res);
});

const getExperiment = asyncHandler(async (req, res) => {
  const experiment = await Experiment.findById(req.params.id)
    .populate('sourceImage')
    .populate('project', 'name');

  if (!experiment) throw new NotFoundError('Experiment not found');
  if (experiment.owner.toString() !== req.user.id && req.user.role !== 'admin') {
    throw new ForbiddenError('You do not have access to this experiment');
  }

  return new ApiResponse(200, 'Experiment fetched successfully', { experiment }).send(res);
});

module.exports = { processImage, listExperiments, getExperiment };