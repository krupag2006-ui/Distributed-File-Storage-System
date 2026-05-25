const express = require('express');
const {
  analytics,
  deleteFile,
  downloadChunk,
  downloadChunkText,
  downloadFullFile,
  getChunkTextPreview,
  getChunks,
  listFiles,
  completeChunkedUpload,
  startChunkedUpload,
  uploadFileChunk,
  uploadFile
} = require('../controllers/fileController');
const protect = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

const router = express.Router();

router.use(protect);

router.get('/', listFiles);
router.get('/analytics', analytics);
router.post('/upload/start', startChunkedUpload);
router.post('/upload/:fileId/chunk', upload.single('chunk'), uploadFileChunk);
router.post('/upload/:fileId/complete', completeChunkedUpload);
router.post('/upload', upload.single('file'), uploadFile);
router.get('/:fileId/chunks', getChunks);
router.get('/chunks/:fileId', getChunks);
router.get('/chunk-text/:chunkId', getChunkTextPreview);
router.get('/chunks/:chunkId/download', downloadChunk);
router.get('/download-chunk/:chunkId', downloadChunk);
router.get('/chunks/:chunkId/text', downloadChunkText);
router.get('/download-chunk-text/:chunkId', downloadChunkText);
router.get('/download-file/:fileId', downloadFullFile);
router.get('/:fileId/download', downloadFullFile);
router.delete('/:fileId', deleteFile);

module.exports = router;
