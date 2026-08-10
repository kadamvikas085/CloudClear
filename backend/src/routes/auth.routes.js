const express = require('express');
const rateLimit = require('express-rate-limit');

const authController = require('../controllers/auth.controller');
const validate = require('../middlewares/validate');
const { protect } = require('../middlewares/auth.middleware');
const {
  registerValidator,
  loginValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
  verifyEmailValidator,
} = require('../validators/auth.validator');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    statusCode: 429,
    message: 'Too many attempts. Please try again in 15 minutes.',
  },
});

/**
 * @openapi
 * /auth/register:
 *   post:
 *     summary: Register a new user account
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name: { type: string, example: "Asha Rao" }
 *               email: { type: string, example: "asha@example.com" }
 *               password: { type: string, example: "Str0ngPass!" }
 *     responses:
 *       201: { description: Registration successful, verification email queued }
 *       409: { description: Email already in use }
 *       422: { description: Validation failed }
 */
router.post('/register', authLimiter, registerValidator, validate, authController.register);

/**
 * @openapi
 * /auth/login:
 *   post:
 *     summary: Log in and receive an access token (refresh token set as httpOnly cookie)
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string }
 *               password: { type: string }
 *     responses:
 *       200: { description: Login successful, returns user + accessToken }
 *       401: { description: Invalid credentials or deactivated account }
 */
router.post('/login', authLimiter, loginValidator, validate, authController.login);

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     summary: Log out and revoke the current refresh token
 *     tags: [Auth]
 *     security: []
 *     responses:
 *       200: { description: Logged out successfully }
 */
router.post('/logout', authController.logout);

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     summary: Rotate the refresh token and issue a new access token
 *     tags: [Auth]
 *     security: []
 *     responses:
 *       200: { description: New accessToken issued }
 *       401: { description: Refresh token missing, invalid, or expired }
 */
router.post('/refresh', authController.refresh);

router.post('/verify-email', verifyEmailValidator, validate, authController.verifyEmail);
router.post('/resend-verification', authLimiter, authController.resendVerification);

router.post(
  '/forgot-password',
  authLimiter,
  forgotPasswordValidator,
  validate,
  authController.forgotPassword
);
router.post('/reset-password', resetPasswordValidator, validate, authController.resetPassword);

/**
 * @openapi
 * /auth/me:
 *   get:
 *     summary: Get the currently authenticated user's profile
 *     tags: [Auth]
 *     responses:
 *       200: { description: Current user }
 *       401: { description: Not authenticated }
 */
router.get('/me', protect, authController.getMe);

module.exports = router;