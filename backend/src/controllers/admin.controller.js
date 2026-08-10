const User = require('../models/User.model');
const Image = require('../models/Image.model');
const Experiment = require('../models/Experiment.model');
const AuditLog = require('../models/AuditLog.model');
const tokenService = require('../services/token.service');
const auditLogService = require('../services/auditLog.service');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const { NotFoundError, BadRequestError } = require('../utils/ApiError');

const listUsers = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  const filter = {};
  if (req.query.role) filter.role = req.query.role;
  if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === 'true';
  if (req.query.search) {
    filter.$or = [
      { name: { $regex: req.query.search, $options: 'i' } },
      { email: { $regex: req.query.search, $options: 'i' } },
    ];
  }

  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);

  return new ApiResponse(200, 'Users fetched successfully', { users }, {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  }).send(res);
});

const deleteUser = asyncHandler(async (req, res) => {
  const targetUser = await User.findById(req.params.id);
  if (!targetUser) throw new NotFoundError('User not found');

  if (targetUser._id.toString() === req.user.id) {
    throw new BadRequestError('Admins cannot delete their own account through this endpoint');
  }

  targetUser.isActive = false;
  await targetUser.save({ validateBeforeSave: false });

  await tokenService.revokeAllUserTokens(targetUser._id);

  auditLogService
    .logAction({
      userId: req.user.id,
      action: 'admin_user_deleted',
      description: `Admin ${req.user.email} deactivated user ${targetUser.email}`,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      meta: { targetUserId: targetUser._id.toString() },
    })
    .catch(() => {});

  return new ApiResponse(200, 'User deactivated successfully').send(res);
});

const viewStorage = asyncHandler(async (req, res) => {
  const [totalAgg, topUsers] = await Promise.all([
    Image.aggregate([
      { $group: { _id: null, totalBytes: { $sum: '$fileSizeBytes' }, totalImages: { $sum: 1 } } },
    ]),
    Image.aggregate([
      {
        $group: {
          _id: '$owner',
          totalBytes: { $sum: '$fileSizeBytes' },
          imageCount: { $sum: 1 },
        },
      },
      { $sort: { totalBytes: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: '$user' },
      {
        $project: {
          _id: 0,
          userId: '$_id',
          name: '$user.name',
          email: '$user.email',
          totalBytes: 1,
          imageCount: 1,
        },
      },
    ]),
  ]);

  const totalBytes = totalAgg[0]?.totalBytes || 0;

  return new ApiResponse(200, 'Storage overview fetched successfully', {
    totalUsedBytes: totalBytes,
    totalUsedGB: Number((totalBytes / (1024 * 1024 * 1024)).toFixed(4)),
    totalImages: totalAgg[0]?.totalImages || 0,
    topConsumers: topUsers,
  }).send(res);
});

const viewJobs = asyncHandler(async (req, res) => {
  const statusCounts = await Experiment.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const counts = { queued: 0, running: 0, completed: 0, failed: 0 };
  statusCounts.forEach((row) => {
    counts[row._id] = row.count;
  });

  const recentJobs = await Experiment.find()
    .sort({ createdAt: -1 })
    .limit(20)
    .populate('sourceImage', 'originalFileName')
    .populate('owner', 'name email');

  return new ApiResponse(200, 'Job overview fetched successfully', {
    counts,
    recentJobs,
  }).send(res);
});

const viewLogs = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 50;
  const skip = (page - 1) * limit;

  const filter = {};
  if (req.query.action) filter.action = req.query.action;
  if (req.query.userId) filter.user = req.query.userId;

  const [logs, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'name email'),
    AuditLog.countDocuments(filter),
  ]);

  return new ApiResponse(200, 'Audit logs fetched successfully', { logs }, {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  }).send(res);
});

const viewAiStatistics = asyncHandler(async (req, res) => {
  const stats = await Experiment.aggregate([
    {
      $group: {
        _id: '$modelUsed',
        totalRuns: { $sum: 1 },
        completedRuns: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
        },
        failedRuns: {
          $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] },
        },
        avgProcessingTimeMs: { $avg: '$processingTimeMs' },
        avgPsnr: { $avg: '$psnr' },
        avgSsim: { $avg: '$ssim' },
        avgIou: { $avg: '$iou' },
        avgConfidenceScore: { $avg: '$confidenceScore' },
      },
    },
    {
      $project: {
        _id: 0,
        model: '$_id',
        totalRuns: 1,
        completedRuns: 1,
        failedRuns: 1,
        successRate: {
          $cond: [
            { $eq: ['$totalRuns', 0] },
            0,
            { $multiply: [{ $divide: ['$completedRuns', '$totalRuns'] }, 100] },
          ],
        },
        avgProcessingTimeMs: 1,
        avgPsnr: 1,
        avgSsim: 1,
        avgIou: 1,
        avgConfidenceScore: 1,
      },
    },
    { $sort: { totalRuns: -1 } },
  ]);

  return new ApiResponse(200, 'AI statistics fetched successfully', { stats }).send(res);
});

module.exports = {
  listUsers,
  deleteUser,
  viewStorage,
  viewJobs,
  viewLogs,
  viewAiStatistics,
};