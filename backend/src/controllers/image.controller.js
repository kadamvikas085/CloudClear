const path = require('path');
const notificationService = require('../services/notification.service');
const Image = require('../models/Image.model');
const Project = require('../models/Project.model');
const { uploadBufferToCloudinary, deleteFromCloudinary } = require('../services/upload.service');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const { BadRequestError, NotFoundError, ForbiddenError } = require('../utils/ApiError');

function resolveFileType(file) {
  const ext = path.extname(file.originalname).toLowerCase();

  if (ext === '.tif' || ext === '.tiff') {
    return 'geotiff';
  }
  if (ext === '.png' || file.mimetype === 'image/png') return 'png';
  if (ext === '.jpg' || ext === '.jpeg' || file.mimetype === 'image/jpeg') return 'jpg';

  throw new BadRequestError('Unsupported file type. Allowed: TIFF, GeoTIFF, PNG, JPG');
}

async function findOwnedProjectOr404(projectId, user) {
  const project = await Project.findById(projectId);
  if (!project) throw new NotFoundError('Project not found');
  if (project.owner.toString() !== user.id && user.role !== 'admin') {
    throw new ForbiddenError('You do not have access to this project');
  }
  return project;
}

async function findOwnedImageOr404(imageId, user) {
  const image = await Image.findById(imageId);
  if (!image) throw new NotFoundError('Image not found');
  if (image.owner.toString() !== user.id && user.role !== 'admin') {
    throw new ForbiddenError('You do not have access to this image');
  }
  return image;
}

const uploadImage = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new BadRequestError('No image file was uploaded');
  }

  const { projectId } = req.body;
  const project = await findOwnedProjectOr404(projectId, req.user);

  const fileType = resolveFileType(req.file);

  let result;
  try {
    result = await uploadBufferToCloudinary(req.file.buffer, {
      folder: `cloudvision/projects/${project._id}/images`,
      // Cloudinary transforms/serves TIFFs as 'raw' resources since it
      // can't render them as standard web images the way it does JPG/PNG.
      resourceType: fileType === 'geotiff' || fileType === 'tiff' ? 'raw' : 'image',
    });
  } catch (err) {
    notificationService
      .createNotification({
        userId: req.user.id,
        type: 'upload_failed',
        title: 'Upload failed',
        message: `Failed to upload "${req.file.originalname}" to storage. Please try again.`,
        meta: { projectId: project._id.toString(), fileName: req.file.originalname },
      })
      .catch(() => {});
    throw err;
  }
  const image = await Image.create({
    project: project._id,
    owner: req.user.id,
    originalFileName: req.file.originalname,
    fileType,
    mimeType: req.file.mimetype,
    fileSizeBytes: req.file.size,
    cloudinaryUrl: result.secure_url,
    cloudinaryPublicId: result.public_id,
    cloudinaryResourceType: result.resource_type,
    width: result.width || null,
    height: result.height || null,
  });

  project.imageCount += 1;
  await project.save();

  return new ApiResponse(201, 'Image uploaded successfully', { image }).send(res);
});

const listImages = asyncHandler(async (req, res) => {
  const { projectId } = req.query;
  await findOwnedProjectOr404(projectId, req.user);

  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  const filter = { project: projectId };
  if (req.query.status) filter.status = req.query.status;

  const [images, total] = await Promise.all([
    Image.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Image.countDocuments(filter),
  ]);

  return new ApiResponse(200, 'Images fetched successfully', { images }, {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  }).send(res);
});

const getImage = asyncHandler(async (req, res) => {
  const image = await findOwnedImageOr404(req.params.id, req.user);
  return new ApiResponse(200, 'Image fetched successfully', { image }).send(res);
});

const deleteImage = asyncHandler(async (req, res) => {
  const image = await findOwnedImageOr404(req.params.id, req.user);

  await deleteFromCloudinary(image.cloudinaryPublicId, image.cloudinaryResourceType);
  await image.deleteOne();

  await Project.updateOne(
    { _id: image.project },
    { $inc: { imageCount: -1 } }
  );

  return new ApiResponse(200, 'Image deleted successfully').send(res);
});

module.exports = { uploadImage, listImages, getImage, deleteImage };