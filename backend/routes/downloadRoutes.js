const express = require('express');
const {
  downloadChunk,
  downloadChunkText,
  downloadFile,
  getChunkTextPreview
} = require('../controllers/fileController');
const protect = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.get('/download-chunk/:chunkId', downloadChunk);
router.get('/download-chunk-text/:chunkId', downloadChunkText);
router.get('/chunk-text/:chunkId', getChunkTextPreview);
router.get('/download-file/:fileId', downloadFile);

module.exports = router;
