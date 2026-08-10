const express = require('express');

const imageController = require('../controllers/image.controller');
const validate = require('../middlewares/validate');
const { protect } = require('../middlewares/auth.middleware');
const { satelliteImageUpload } = require('../middlewares/upload.middleware');
const {
  uploadImageValidator,
  listImagesValidator,
  imageIdValidator,
} = require('../validators/image.validator');

const router = express.Router();

router.use(protect);

router.post(
  '/',
  satelliteImageUpload.single('image'),
  uploadImageValidator,
  validate,
  imageController.uploadImage
);
router.get('/', listImagesValidator, validate, imageController.listImages);
router.get('/:id', imageIdValidator, validate, imageController.getImage);
router.delete('/:id', imageIdValidator, validate, imageController.deleteImage);

module.exports = router;