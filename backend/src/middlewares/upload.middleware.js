const multer = require('multer');
const { BadRequestError } = require('../utils/ApiError');

const storage = multer.memoryStorage();

const AVATAR_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const avatarUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!AVATAR_ALLOWED_TYPES.includes(file.mimetype)) {
      return cb(new BadRequestError('Avatar must be a JPEG, PNG, or WEBP image'));
    }
    cb(null, true);
  },
});

const SATELLITE_ALLOWED_TYPES = [
  'image/tiff',
  'image/tif',
  'image/png',
  'image/jpeg',
];

const satelliteImageUpload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const isAllowedMime = SATELLITE_ALLOWED_TYPES.includes(file.mimetype);
    const isTiffExtension = /\.(tif|tiff)$/i.test(file.originalname);
    if (!isAllowedMime && !isTiffExtension) {
      return cb(new BadRequestError('Only TIFF, GeoTIFF, PNG, or JPG images are allowed'));
    }
    cb(null, true);
  },
});

module.exports = { avatarUpload, satelliteImageUpload };