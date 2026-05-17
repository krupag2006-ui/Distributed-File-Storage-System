const express = require('express');
const { replicateFile, getReplicaStatus, recoverFile, replicaHealth } = require('../controllers/replicaController');
const protect = require('../middleware/authMiddleware');

const router = express.Router();
router.use(protect);

router.post('/replicate', replicateFile);
router.get('/replica-status/:fileId', getReplicaStatus);
router.get('/replica-health', replicaHealth);
router.post('/recover/:fileId', recoverFile);

module.exports = router;
