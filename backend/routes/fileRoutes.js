const express = require('express');
const {
  analytics,
  deleteFile,
  downloadChunkText,
  downloadFile,
  getChunkTextPreview,
  getChunks,
  listFiles,
  uploadFile
} = require('../controllers/fileController');
const protect = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

const router = express.Router();

router.use(protect);

router.get('/', listFiles);
router.get('/analytics', analytics);
router.post('/upload', upload.single('file'), uploadFile);
router.get('/:fileId/chunks', getChunks);
router.get('/chunks/:fileId', getChunks);
router.get('/chunk-text/:chunkId', getChunkTextPreview);
router.get('/chunks/:chunkId/text', downloadChunkText);
router.get('/download-chunk-text/:chunkId', downloadChunkText);
router.get('/download-file/:fileId', downloadFile);
router.get('/:fileId/download', downloadFile);
router.delete('/:fileId', deleteFile);

module.exports = router;
