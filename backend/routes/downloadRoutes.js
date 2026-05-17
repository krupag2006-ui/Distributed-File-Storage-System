const express = require('express');
const {
  downloadChunkText,
  downloadFile,
  getChunkTextPreview
} = require('../controllers/fileController');
const protect = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.get('/files/:fileId/download', downloadFile);
router.get('/chunks/:chunkId/text', downloadChunkText);
router.get('/download-chunk-text/:chunkId', downloadChunkText);
router.get('/chunk-text/:chunkId', getChunkTextPreview);
router.get('/download-file/:fileId', downloadFile);

module.exports = router;
