const Project = require('../models/Project.model');
const notificationService = require('../services/notification.service');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const { NotFoundError, ForbiddenError } = require('../utils/ApiError');

async function findOwnedProjectOr404(projectId, user) {
  const project = await Project.findById(projectId);
  if (!project) {
    throw new NotFoundError('Project not found');
  }
  if (project.owner.toString() !== user.id && user.role !== 'admin') {
    throw new ForbiddenError('You do not have access to this project');
  }
  return project;
}

const createProject = asyncHandler(async (req, res) => {
  const { name, description, region } = req.body;

  const project = await Project.create({
    owner: req.user.id,
    name,
    description,
    region,
  });

  // Best-effort — a notification failure should never fail project creation.
  notificationService
    .createNotification({
      userId: req.user.id,
      type: 'new_project_created',
      title: 'New project created',
      message: `Project "${project.name}" was created successfully.`,
      meta: { projectId: project._id.toString() },
    })
    .catch(() => {});

  return new ApiResponse(201, 'Project created successfully', { project }).send(res);
});

const listProjects = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const skip = (page - 1) * limit;

  const filter = { owner: req.user.id };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.search) {
    filter.name = { $regex: req.query.search, $options: 'i' };
  }

  const [projects, total] = await Promise.all([
    Project.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Project.countDocuments(filter),
  ]);

  return new ApiResponse(200, 'Projects fetched successfully', { projects }, {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  }).send(res);
});

const getProject = asyncHandler(async (req, res) => {
  const project = await findOwnedProjectOr404(req.params.id, req.user);
  return new ApiResponse(200, 'Project fetched successfully', { project }).send(res);
});

const updateProject = asyncHandler(async (req, res) => {
  const project = await findOwnedProjectOr404(req.params.id, req.user);

  const { name, description, region, status } = req.body;
  if (name !== undefined) project.name = name;
  if (description !== undefined) project.description = description;
  if (region !== undefined) project.region = region;
  if (status !== undefined) project.status = status;

  await project.save();

  return new ApiResponse(200, 'Project updated successfully', { project }).send(res);
});

const deleteProject = asyncHandler(async (req, res) => {
  const project = await findOwnedProjectOr404(req.params.id, req.user);
  await project.deleteOne();
  return new ApiResponse(200, 'Project deleted successfully').send(res);
});

module.exports = { createProject, listProjects, getProject, updateProject, deleteProject };