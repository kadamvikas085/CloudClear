const emailService = require('../services/email.service');
const { logger } = require('../config/logger');

async function processEmailJob(job) {
  const { type, email, name, rawToken } = job.data;
  logger.info({ jobId: job.id, type, email }, 'Sending queued email');

  const fakeUser = { email, name };

  if (type === 'verification') {
    await emailService.sendVerificationEmail(fakeUser, rawToken);
  } else if (type === 'password-reset') {
    await emailService.sendPasswordResetEmail(fakeUser, rawToken);
  } else {
    logger.warn({ type }, 'Unknown email job type — skipping');
  }
}

module.exports = processEmailJob;