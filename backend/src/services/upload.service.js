const cloudinary = require('../config/cloudinary');
const { InternalServerError } = require('../utils/ApiError');

function uploadBufferToCloudinary(buffer, { folder, publicId, resourceType = 'image' } = {}) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: resourceType,
        overwrite: true,
      },
      (error, result) => {
        if (error) {
          return reject(new InternalServerError('Failed to upload file to storage', error.message));
        }
        resolve(result);
      }
    );
    uploadStream.end(buffer);
  });
}

async function deleteFromCloudinary(publicId, resourceType = 'image') {
  if (!publicId) return;
  await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
}

module.exports = { uploadBufferToCloudinary, deleteFromCloudinary };