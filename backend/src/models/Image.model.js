const mongoose = require('mongoose');

const imageSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    originalFileName: {
      type: String,
      required: true,
    },
    fileType: {
      type: String,
      required: true,
      enum: ['tiff', 'geotiff', 'png', 'jpg'],
    },
    mimeType: {
      type: String,
      required: true,
    },
    fileSizeBytes: {
      type: Number,
      required: true,
    },
    cloudinaryUrl: {
      type: String,
      required: true,
    },
    cloudinaryPublicId: {
      type: String,
      required: true,
    },
    cloudinaryResourceType: {
      type: String,
      default: 'image',
    },
    width: {
      type: Number,
      default: null,
    },
    height: {
      type: Number,
      default: null,
    },
    geoMetadata: {
      crs: { type: String, default: null },
      boundingBox: {
        type: [Number],
        default: null,
      },
      resolutionMeters: { type: Number, default: null },
    },
    status: {
      type: String,
      enum: ['uploaded', 'processing', 'processed', 'failed'],
      default: 'uploaded',
    },
  },
  { timestamps: true }
);

imageSchema.index({ project: 1, createdAt: -1 });
imageSchema.index({ owner: 1, createdAt: -1 });

module.exports = mongoose.model('Image', imageSchema);