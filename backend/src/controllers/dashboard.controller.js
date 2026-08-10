const mongoose = require('mongoose');
const Project = require('../models/Project.model');
const Image = require('../models/Image.model');
const Experiment = require('../models/Experiment.model');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');

const getSummary = asyncHandler(async (req, res) => {
  const ownerId = new mongoose.Types.ObjectId(req.user.id);

  const [
    totalProjects,
    totalImages,
    metricsAgg,
    storageAgg,
    recentExperiments,
  ] = await Promise.all([
    Project.countDocuments({ owner: ownerId }),

    Image.countDocuments({ owner: ownerId }),

    Experiment.aggregate([
      { $match: { owner: ownerId, status: 'completed' } },
      {
        $group: {
          _id: null,
          avgPsnr: { $avg: '$psnr' },
          avgSsim: { $avg: '$ssim' },
          avgIou: { $avg: '$iou' },
          avgRmse: { $avg: '$rmse' },
          avgMae: { $avg: '$mae' },
          avgConfidenceScore: { $avg: '$confidenceScore' },
          totalCompletedExperiments: { $sum: 1 },
        },
      },
    ]),

    Image.aggregate([
      { $match: { owner: ownerId } },
      { $group: { _id: null, totalBytes: { $sum: '$fileSizeBytes' } } },
    ]),

    Experiment.find({ owner: ownerId })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('sourceImage', 'originalFileName cloudinaryUrl')
      .populate('project', 'name'),
  ]);

  const metrics = metricsAgg[0] || {
    avgPsnr: null,
    avgSsim: null,
    avgIou: null,
    avgRmse: null,
    avgMae: null,
    avgConfidenceScore: null,
    totalCompletedExperiments: 0,
  };

  const storageUsedBytes = storageAgg[0]?.totalBytes || 0;

  return new ApiResponse(200, 'Dashboard summary fetched successfully', {
    totals: {
      projects: totalProjects,
      images: totalImages,
      completedExperiments: metrics.totalCompletedExperiments,
    },
    averageMetrics: {
      psnr: metrics.avgPsnr,
      ssim: metrics.avgSsim,
      iou: metrics.avgIou,
      rmse: metrics.avgRmse,
      mae: metrics.avgMae,
      confidenceScore: metrics.avgConfidenceScore,
    },
    storage: {
      usedBytes: storageUsedBytes,
      usedMB: Number((storageUsedBytes / (1024 * 1024)).toFixed(2)),
      usedGB: Number((storageUsedBytes / (1024 * 1024 * 1024)).toFixed(4)),
    },
    recentExperiments,
  }).send(res);
});

module.exports = { getSummary };