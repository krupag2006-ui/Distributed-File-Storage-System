const path = require('path');
const { chunkFile, DEFAULT_CHUNK_SIZE } = require('../utils/chunkFile');
const mergeChunks = require('../utils/mergeChunks');
const { deleteChunksFromCloud, downloadChunkFromCloud } = require('../utils/supabaseStorage');
const { calculateSha256 } = require('../utils/fileHash');
const { buildTextPreview, isZipArchive } = require('../utils/textPreview');
const { supabasePrimaryBucket } = require('../config/supabase');
const {
  createFile,
  deleteFileByIdForUser,
  getFileByIdForUser,
  getFilesByUser,
  getStorageAnalytics,
  getUploadsByDay
} = require('../models/fileModel');
const { createChunk, getChunkByIdForUser, getChunksByFile } = require('../models/chunkModel');
const { createFileMetadata, getFileMetadataByFileId } = require('../models/fileMetadataModel');
const { createReplicas, getReplicasByChunk, getReplicasByFile } = require('../models/replicaModel');

const sanitizeName = (name) =>
  path
    .basename(name)
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 180);

const sanitizeBaseName = (name) => {
  const parsedName = path.parse(sanitizeName(name));
  return (parsedName.name || parsedName.base || 'file').slice(0, 160);
};

const toNumber = (value) => Number.parseInt(value, 10);

const formatAnalytics = (analytics) => ({
  totalFiles: Number(analytics.total_files || 0),
  totalStorage: Number(analytics.total_storage || 0),
  averageFileSize: Number(analytics.average_file_size || 0),
  totalChunks: Number(analytics.total_chunks || 0)
});

const formatChunk = (chunk) => ({
  id: chunk.id,
  file_id: chunk.file_id,
  chunk_index: chunk.chunk_index,
  chunk_path: chunk.chunk_path,
  storage_bucket: chunk.storage_bucket || supabasePrimaryBucket,
  chunk_size: Number(chunk.chunk_size),
  chunk_hash: chunk.chunk_hash,
  chunk_status: chunk.chunk_status
});

const activeReplicaSources = (replicas = []) =>
  replicas
    .filter((replica) => !replica.replica_status || replica.replica_status === 'active')
    .map((replica) => ({
      bucket: replica.bucket,
      path: replica.replica_path
    }));

const attachReplicasToChunks = (chunks, replicas) => {
  const replicasByChunkId = new Map();

  for (const replica of replicas) {
    const current = replicasByChunkId.get(replica.chunk_id) || [];
    current.push(replica);
    replicasByChunkId.set(replica.chunk_id, current);
  }

  return chunks.map((chunk) => ({
    ...chunk,
    replicaSources: activeReplicaSources(replicasByChunkId.get(chunk.id) || [])
  }));
};

const validateChunkRecord = (chunk) => {
  if (!chunk.chunk_path) {
    const error = new Error(`Chunk ${chunk.id} is missing a storage path.`);
    error.statusCode = 409;
    throw error;
  }

  if (!Number.isInteger(Number(chunk.chunk_index))) {
    const error = new Error(`Chunk ${chunk.id} is missing a valid sequence index.`);
    error.statusCode = 409;
    throw error;
  }
};

const validateFileChunks = (file, chunks) => {
  if (chunks.length !== file.chunk_count) {
    return 'This file is missing one or more chunks and cannot be reconstructed.';
  }

  const orderedChunks = [...chunks].sort((first, second) => first.chunk_index - second.chunk_index);
  const expectedStart = Number(orderedChunks[0]?.chunk_index) === 0 ? 0 : 1;

  for (let index = 0; index < orderedChunks.length; index += 1) {
    const chunk = orderedChunks[index];

    try {
      validateChunkRecord(chunk);
    } catch (error) {
      return error.message;
    }

    if (Number(chunk.chunk_index) !== expectedStart + index) {
      return `This file is missing chunk ${expectedStart + index} and cannot be reconstructed.`;
    }
  }

  return null;
};

const getChunkBuffer = async (chunk) => {
  validateChunkRecord(chunk);

  const replicas = chunk.replicaSources
    ? []
    : await getReplicasByChunk(chunk.id);
  const replicaSources = chunk.replicaSources || activeReplicaSources(replicas);

  const chunkBuffer = await downloadChunkFromCloud(chunk.chunk_path, {
    bucket: chunk.storage_bucket,
    chunkIndex: chunk.chunk_index,
    fileId: chunk.file_id,
    replicaSources
  });
  const actualHash = calculateSha256(chunkBuffer);

  if (chunk.chunk_hash && actualHash !== chunk.chunk_hash) {
    const error = new Error('Chunk failed integrity validation and may be corrupted.');
    error.statusCode = 500;
    throw error;
  }

  return { chunkBuffer, actualHash };
};

const getMergedFileBufferForChunk = async (chunk, userId) => {
  const file = await getFileByIdForUser(chunk.file_id, userId);

  if (!file) {
    const error = new Error('File not found.');
    error.statusCode = 404;
    throw error;
  }

  const chunks = await getChunksByFile(file.id);
  const validationError = validateFileChunks(file, chunks);

  if (validationError) {
    const error = new Error(validationError);
    error.statusCode = 409;
    throw error;
  }

  const replicas = await getReplicasByFile(file.id);
  return mergeChunks(attachReplicasToChunks(chunks, replicas));
};

const getReadableChunkText = async ({ chunk, userId, maxChars }) => {
  const metadata = await getFileMetadataByFileId(chunk.file_id);
  const contentType = metadata?.content_type || '';
  const { chunkBuffer } = await getChunkBuffer(chunk);
  const archiveBuffer = isZipArchive({ contentType, fileName: chunk.file_name })
    ? await getMergedFileBufferForChunk(chunk, userId)
    : null;

  return {
    contentType,
    preview: buildTextPreview({
      buffer: chunkBuffer,
      archiveBuffer,
      contentType,
      fileName: chunk.file_name,
      maxChars
    })
  };
};

const uploadFile = async (req, res, next) => {
  let createdFileId = null;
  let uploadedChunkPaths = [];

  try {
    if (!req.file) {
      return res.status(400).json({ message: 'File is required.' });
    }

    const fileName = sanitizeName(req.file.originalname);
    const fileSize = req.file.size;
    const chunkCount = Math.ceil(fileSize / DEFAULT_CHUNK_SIZE);

    if (fileSize <= 0) {
      return res.status(400).json({ message: 'Uploaded file cannot be empty.' });
    }

    createdFileId = await createFile({
      userId: req.user.id,
      fileName,
      fileSize,
      chunkCount
    });

    const savedChunks = await chunkFile({
      fileId: createdFileId,
      fileBuffer: req.file.buffer
    });

    uploadedChunkPaths = savedChunks.map((chunk) => chunk.chunkPath);

    for (const chunk of savedChunks) {
      const chunkId = await createChunk({
        fileId: createdFileId,
        chunkIndex: chunk.chunkIndex,
        chunkPath: chunk.chunkPath,
        storageBucket: supabasePrimaryBucket,
        chunkSize: chunk.chunkSize,
        chunkHash: chunk.chunkHash
      });

      if (chunk.replicaPaths?.length) {
        await createReplicas(
          chunk.replicaPaths.map((replica) => ({
            chunkId,
            bucket: replica.bucket,
            replicaPath: replica.path,
            replicaStatus: 'active'
          }))
        );
      }
    }

    const fileMetadata = await createFileMetadata({
      fileId: createdFileId,
      contentType: req.file.mimetype,
      checksum: calculateSha256(req.file.buffer)
    });

    const chunks = await getChunksByFile(createdFileId);
    const file = await getFileByIdForUser(createdFileId, req.user.id);

    return res.status(201).json({
      message: 'File uploaded, split into chunks, and saved successfully.',
      file,
      metadata: fileMetadata,
      chunks: chunks.map(formatChunk)
    });
  } catch (error) {
    if (createdFileId) {
      if (uploadedChunkPaths.length) {
        try {
          await deleteChunksFromCloud(uploadedChunkPaths);
        } catch (cleanupError) {
          console.error(cleanupError);
        }
      }
      await deleteFileByIdForUser(createdFileId, req.user.id);
    }

    next(error);
  }
};

const getChunks = async (req, res, next) => {
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
    return res.json({
      file,
      chunks: chunks.map(formatChunk)
    });
  } catch (error) {
    next(error);
  }
};

const downloadChunkText = async (req, res, next) => {
  try {
    const chunkId = toNumber(req.params.chunkId);

    if (!Number.isInteger(chunkId)) {
      return res.status(400).json({ message: 'A valid chunk id is required.' });
    }

    const chunk = await getChunkByIdForUser(chunkId, req.user.id);

    if (!chunk) {
      return res.status(404).json({ message: 'Chunk not found.' });
    }

    const { preview } = await getReadableChunkText({
      chunk,
      userId: req.user.id,
      maxChars: 500000
    });
    const fileName = `${sanitizeBaseName(chunk.file_name)}_chunk_${chunk.chunk_index}.txt`;

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Length', String(Buffer.byteLength(preview.text)));
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    return res.send(preview.text);
  } catch (error) {
    next(error);
  }
};

const getChunkTextPreview = async (req, res, next) => {
  try {
    const chunkId = toNumber(req.params.chunkId);

    if (!Number.isInteger(chunkId)) {
      return res.status(400).json({ message: 'A valid chunk id is required.' });
    }

    const chunk = await getChunkByIdForUser(chunkId, req.user.id);

    if (!chunk) {
      return res.status(404).json({ message: 'Chunk not found.' });
    }

    const { contentType, preview } = await getReadableChunkText({
      chunk,
      userId: req.user.id,
      maxChars: 12000
    });

    return res.json({
      chunk: formatChunk(chunk),
      contentType: contentType || 'application/octet-stream',
      mode: preview.mode,
      language: preview.language,
      sourceFiles: preview.sourceFiles,
      text: preview.text,
      truncated: preview.truncated
    });
  } catch (error) {
    next(error);
  }
};

const listFiles = async (req, res, next) => {
  try {
    const files = await getFilesByUser(req.user.id, req.query.search || '');
    return res.json({ files });
  } catch (error) {
    next(error);
  }
};

const downloadFile = async (req, res, next) => {
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
    const validationError = validateFileChunks(file, chunks);

    if (validationError) {
      return res.status(409).json({
        message: validationError
      });
    }

    const replicas = await getReplicasByFile(file.id);
    const chunksWithReplicas = attachReplicasToChunks(chunks, replicas);
    const mergedFile = await mergeChunks(chunksWithReplicas);
    const metadata = await getFileMetadataByFileId(file.id);

    if (metadata?.checksum) {
      const reconstructedHash = calculateSha256(mergedFile);
      if (reconstructedHash !== metadata.checksum) {
        return res.status(500).json({
          message: 'File reconstruction failed integrity validation. The reconstructed file is corrupted.'
        });
      }
    }

    const safeFileName = sanitizeName(file.file_name);
    const contentType = metadata?.content_type || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', String(mergedFile.length));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeFileName}"; filename*=UTF-8''${encodeURIComponent(file.file_name)}`
    );
    res.setHeader('Cache-Control', 'no-cache');

    // Send buffer directly without any encoding
    res.end(mergedFile);
  } catch (error) {
    next(error);
  }
};

const deleteFile = async (req, res, next) => {
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
    await deleteChunksFromCloud(chunks.map((chunk) => chunk.chunk_path));
    await deleteFileByIdForUser(file.id, req.user.id);

    return res.json({ message: 'File and chunks deleted successfully.' });
  } catch (error) {
    next(error);
  }
};

const analytics = async (req, res, next) => {
  try {
    const summary = await getStorageAnalytics(req.user.id);
    const uploadsByDay = await getUploadsByDay(req.user.id);

    return res.json({
      summary: formatAnalytics(summary),
      uploadsByDay: uploadsByDay.map((item) => ({
        date: item.upload_day,
        fileCount: Number(item.file_count || 0),
        storageUsed: Number(item.storage_used || 0)
      }))
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  uploadFile,
  getChunks,
  downloadChunkText,
  getChunkTextPreview,
  listFiles,
  downloadFile,
  deleteFile,
  analytics
};
