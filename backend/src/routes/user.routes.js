const express = require('express');

const userController = require('../controllers/user.controller');
const validate = require('../middlewares/validate');
const { protect } = require('../middlewares/auth.middleware');
const { avatarUpload } = require('../middlewares/upload.middleware');
const {
  updateProfileValidator,
  changePasswordValidator,
  deleteAccountValidator,
} = require('../validators/user.validator');

const router = express.Router();

router.use(protect);

router.patch('/me', updateProfileValidator, validate, userController.updateProfile);
router.patch('/me/avatar', avatarUpload.single('avatar'), userController.updateAvatar);
router.patch('/me/password', changePasswordValidator, validate, userController.changePassword);
router.delete('/me', deleteAccountValidator, validate, userController.deleteAccount);

module.exports = router;