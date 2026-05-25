const multer = require('multer');

const maxUploadSize = Number(process.env.MAX_UPLOAD_SIZE_BYTES || 100 * 1024 * 1024);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxUploadSize
  }
});

module.exports = upload;
