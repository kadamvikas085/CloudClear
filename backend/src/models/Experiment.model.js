const mongoose = require('mongoose');

const experimentSchema = new mongoose.Schema(
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
    sourceImage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Image',
      required: true,
      index: true,
    },
    modelUsed: {
      type: String,
      enum: ['GAN', 'Diffusion', 'LaMa', 'U-Net'],
      required: true,
    },

    processedImageUrl: {
      type: String,
      default: null,
    },
    processedImagePublicId: {
      type: String,
      default: null,
    },
    confidenceMapUrl: {
      type: String,
      default: null,
    },
    confidenceMapPublicId: {
      type: String,
      default: null,
    },

    processingTimeMs: {
      type: Number,
      default: null,
    },
    psnr: { type: Number, default: null },
    ssim: { type: Number, default: null },
    iou: { type: Number, default: null },
    rmse: { type: Number, default: null },
    mae: { type: Number, default: null },
    confidenceScore: { type: Number, default: null },

    status: {
      type: String,
      enum: ['queued', 'running', 'completed', 'failed'],
      default: 'queued',
    },
    errorMessage: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

experimentSchema.index({ project: 1, createdAt: -1 });
experimentSchema.index({ owner: 1, createdAt: -1 });
experimentSchema.index({ sourceImage: 1 });

module.exports = mongoose.model('Experiment', experimentSchema);