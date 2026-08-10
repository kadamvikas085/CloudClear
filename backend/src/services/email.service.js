const nodemailer = require('nodemailer');
const config = require('../config/env');
const { logger } = require('../config/logger');

const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: config.smtp.port === 465,
  auth: {
    user: config.smtp.user,
    pass: config.smtp.pass,
  },
});

async function sendMail({ to, subject, html }) {
  try {
    await transporter.sendMail({
      from: config.smtp.from,
      to,
      subject,
      html,
    });
  } catch (err) {
    logger.error({ err, to, subject }, '[Email] Failed to send email');
    throw err;
  }
}

async function sendVerificationEmail(user, rawToken) {
  const verifyUrl = `${config.clientUrl}/verify-email?token=${rawToken}`;
  await sendMail({
    to: user.email,
    subject: 'Verify your CloudVision AI account',
    html: `
      <p>Hi ${user.name},</p>
      <p>Please verify your email address to activate your CloudVision AI account.</p>
      <p><a href="${verifyUrl}">Click here to verify your email</a></p>
      <p>This link expires in 24 hours. If you didn't create this account, you can ignore this email.</p>
    `,
  });
}

async function sendPasswordResetEmail(user, rawToken) {
  const resetUrl = `${config.clientUrl}/reset-password?token=${rawToken}`;
  await sendMail({
    to: user.email,
    subject: 'Reset your CloudVision AI password',
    html: `
      <p>Hi ${user.name},</p>
      <p>We received a request to reset your password.</p>
      <p><a href="${resetUrl}">Click here to reset your password</a></p>
      <p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
    `,
  });
}

module.exports = { sendMail, sendVerificationEmail, sendPasswordResetEmail };