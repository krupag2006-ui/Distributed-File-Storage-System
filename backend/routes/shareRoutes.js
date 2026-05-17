const express = require('express');
const {
  createShareLink,
  getSharedLink,
  listSharedFiles,
  updateSharedPermissions,
  deleteSharedLink,
  downloadSharedFile
} = require('../controllers/shareController');
const protect = require('../middleware/authMiddleware');
const optionalAuth = require('../middleware/optionalAuthMiddleware');

const router = express.Router();

router.post('/share-file', protect, createShareLink);
router.get('/shared-files', protect, listSharedFiles);
router.put('/permissions/:id', protect, updateSharedPermissions);
router.delete('/share/:id', protect, deleteSharedLink);
router.get('/shared/:token', optionalAuth, getSharedLink);
router.get('/download/:token', optionalAuth, downloadSharedFile);

module.exports = router;
