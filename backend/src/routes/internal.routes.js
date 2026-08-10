const express = require('express');
const crypto = require('crypto');

const User = require('../models/User.model');
const Project = require('../models/Project.model');
const Image = require('../models/Image.model');
const Experiment = require('../models/Experiment.model');
const { enqueueInferenceJob } = require('../queues/aiProcessing.queue');

const router = express.Router();

// Dev-only endpoint to trigger an end-to-end job for integration testing.
// Enabled only when DEV_INTEGRATION_ALLOW=true in the environment.
router.post('/integration/trigger', async (req, res) => {
  if (process.env.DEV_INTEGRATION_ALLOW !== 'true') {
    return res.status(403).json({ success: false, message: 'Integration triggers are disabled' });
  }

  const { imageUrl } = req.body || {};
  if (!imageUrl) {
    return res.status(422).json({ success: false, message: 'imageUrl is required in body' });
  }

  // Create ephemeral user, project, image, experiment
  const email = `integration+${Date.now()}@example.local`;
  const password = crypto.randomBytes(8).toString('hex');
  const user = await User.create({ name: 'Integration Test', email, password });

  const project = await Project.create({ owner: user._id, name: 'Integration Project' });

  const image = await Image.create({
    project: project._id,
    owner: user._id,
    originalFileName: 'integration.png',
    fileType: 'png',
    mimeType: 'image/png',
    fileSizeBytes: 1234,
    cloudinaryUrl: imageUrl,
    cloudinaryPublicId: `integration/${Date.now()}`,
    cloudinaryResourceType: 'image',
    status: 'uploaded',
  });

  const experiment = await Experiment.create({
    project: project._id,
    owner: user._id,
    sourceImage: image._id,
    modelUsed: 'LaMa',
    status: 'queued',
  });

  // enqueue job
  await enqueueInferenceJob(experiment._id.toString());

  return res.status(202).json({ success: true, message: 'Integration job queued', data: { experimentId: experiment._id.toString(), userId: user._id.toString() } });
});

module.exports = router;
