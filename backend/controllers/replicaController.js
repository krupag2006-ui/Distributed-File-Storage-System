const { getFileByIdForUser } = require('../models/fileModel');
const { getChunksByFile, updateChunkHealth } = require('../models/chunkModel');
const {
  createReplica,
  getReplicaSummaryByFile,
  getReplicasByChunk,
  getReplicasByFile,
  updateReplicaHealth
} = require('../models/replicaModel');
const { calculateSha256 } = require('../utils/fileHash');
const {
  downloadChunkFromBucket,
  downloadChunkFromCloud,
  replicateChunkToBackup,
  restorePrimaryChunk
} = require('../utils/supabaseStorage');
const { supabaseReplicaBuckets } = require('../config/supabase');

const toNumber = (value) => Number.parseInt(value, 10);

const verifyBufferHash = (chunk, chunkBuffer) => {
  if (!chunk.chunk_hash) return true;
  return calculateSha256(chunkBuffer) === chunk.chunk_hash;
};

const storageOptionsForChunk = (chunk) => ({
  bucket: chunk.storage_bucket,
  fileId: chunk.file_id,
  chunkIndex: chunk.chunk_index
});

const replicateFile = async (req, res, next) => {
  try {
    const fileId = toNumber(req.body.fileId);

    if (!Number.isInteger(fileId)) {
      return res.status(400).json({ message: 'A valid file id is required.' });
    }

    const file = await getFileByIdForUser(fileId, req.user.id);
    if (!file) {
      return res.status(404).json({ message: 'File not found.' });
    }

    const chunks = await getChunksByFile(file.id);
    const replicasCreated = [];
    const replicaErrors = [];

    for (const chunk of chunks) {
      const existingReplicas = await getReplicasByChunk(chunk.id);
      const replicaBuckets = existingReplicas.map((replica) => replica.bucket);

      for (const bucket of supabaseReplicaBuckets) {
        if (!replicaBuckets.includes(bucket)) {
          try {
            const chunkBuffer = await downloadChunkFromCloud(
              chunk.chunk_path,
              storageOptionsForChunk(chunk)
            );
            if (!verifyBufferHash(chunk, chunkBuffer)) {
              await updateChunkHealth({ chunkId: chunk.id, status: 'corrupted' });
              throw new Error(`Chunk ${chunk.id} failed checksum verification.`);
            }

            const replicaPath = await replicateChunkToBackup(chunkBuffer, chunk.chunk_path, bucket);

            await createReplica({
              chunkId: chunk.id,
              bucket,
              replicaPath,
              replicaStatus: 'active'
            });

            replicasCreated.push({ chunkId: chunk.id, bucket });
          } catch (error) {
            console.warn(`Failed to create replica for chunk ${chunk.id} in bucket ${bucket}:`, error.message);
            replicaErrors.push({ chunkId: chunk.id, bucket, error: error.message });
          }
        }
      }
    }

    return res.json({
      message: 'Replication check completed.',
      replicasCreated: replicasCreated.length,
      totalChunks: chunks.length,
      errors: replicaErrors
    });
  } catch (error) {
    next(error);
  }
};

const getReplicaStatus = async (req, res, next) => {
  try {
    const fileId = toNumber(req.params.fileId);

    if (!Number.isInteger(fileId)) {
      return res.status(400).json({ message: 'A valid file id is required.' });
    }

    const file = await getFileByIdForUser(fileId, req.user.id);
    if (!file) {
      return res.status(404).json({ message: 'File not found.' });
    }

    const summary = await getReplicaSummaryByFile(file.id);
    const replicas = await getReplicasByFile(file.id);
    const chunks = await getChunksByFile(file.id);

    return res.json({
      file,
      expectedReplicaBuckets: supabaseReplicaBuckets,
      chunks: summary,
      replicas,
      healthy: chunks.every((chunk) => chunk.chunk_status === 'healthy')
    });
  } catch (error) {
    next(error);
  }
};

const recoverFile = async (req, res, next) => {
  try {
    const fileId = toNumber(req.params.fileId);

    if (!Number.isInteger(fileId)) {
      return res.status(400).json({ message: 'A valid file id is required.' });
    }

    const file = await getFileByIdForUser(fileId, req.user.id);
    if (!file) {
      return res.status(404).json({ message: 'File not found.' });
    }

    const chunks = await getChunksByFile(file.id);
    let recoveredCount = 0;
    const failures = [];

    for (const chunk of chunks) {
      try {
        const primaryBuffer = await downloadChunkFromCloud(
          chunk.chunk_path,
          storageOptionsForChunk(chunk)
        );
        if (!verifyBufferHash(chunk, primaryBuffer)) {
          await updateChunkHealth({ chunkId: chunk.id, status: 'corrupted' });
          throw new Error('Primary chunk failed checksum verification.');
        }

        await updateChunkHealth({ chunkId: chunk.id, status: 'healthy' });
      } catch (primaryError) {
        console.warn(`Primary chunk ${chunk.id} missing:`, primaryError.message);

        const replicas = await getReplicasByChunk(chunk.id);
        let recovered = false;

        for (const replica of replicas) {
          try {
            const chunkBuffer = await downloadChunkFromBucket(
              replica.bucket,
              replica.replica_path,
              storageOptionsForChunk(chunk)
            );
            if (!verifyBufferHash(chunk, chunkBuffer)) {
              await updateReplicaHealth({ replicaId: replica.id, status: 'corrupted' });
              throw new Error('Replica chunk failed checksum verification.');
            }

            await restorePrimaryChunk(chunk.chunk_path, chunkBuffer, chunk.storage_bucket);
            await updateReplicaHealth({ replicaId: replica.id, status: 'active' });
            await updateChunkHealth({ chunkId: chunk.id, status: 'healthy' });
            recovered = true;
            recoveredCount += 1;
            break;
          } catch (replicaError) {
            console.warn(`Replica recovery failed for chunk ${chunk.id} from ${replica.bucket}:`, replicaError.message);
          }
        }

        if (!recovered) {
          console.error(`Failed to recover chunk ${chunk.id} from any source`);
          failures.push({ chunkId: chunk.id, error: primaryError.message });
        }
      }
    }

    return res.json({
      message: 'Replica recovery complete.',
      recoveredChunks: recoveredCount,
      totalChunks: chunks.length,
      failures
    });
  } catch (error) {
    next(error);
  }
};

const replicaHealth = async (req, res, next) => {
  try {
    const fileId = req.query.fileId ? toNumber(req.query.fileId) : null;

    if (req.query.fileId && !Number.isInteger(fileId)) {
      return res.status(400).json({ message: 'A valid file id is required.' });
    }

    if (fileId) {
      const file = await getFileByIdForUser(fileId, req.user.id);
      if (!file) {
        return res.status(404).json({ message: 'File not found.' });
      }

      const summary = await getReplicaSummaryByFile(file.id);
      return res.json({
        status: summary.every((chunk) => Number(chunk.active_replica_count || 0) >= supabaseReplicaBuckets.length)
          ? 'healthy'
          : 'degraded',
        fileId: file.id,
        expectedReplicaBuckets: supabaseReplicaBuckets,
        chunks: summary
      });
    }

    return res.json({
      status: 'ok',
      expectedReplicaBuckets: supabaseReplicaBuckets,
      message: 'Replica subsystem is reachable. Pass fileId to inspect a specific file.'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  replicateFile,
  getReplicaStatus,
  recoverFile,
  replicaHealth
};
