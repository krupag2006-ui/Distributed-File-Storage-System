const path = require('path');
const { chunkFile, DEFAULT_CHUNK_SIZE } = require('../utils/chunkFile');
const mergeChunks = require('../utils/mergeChunks');
const { deleteChunksFromCloud, downloadChunkFromCloud } = require('../utils/supabaseStorage');
const { calculateSha256 } = require('../utils/fileHash');
const { buildTextPreview } = require('../utils/textPreview');
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
const { createReplicas } = require('../models/replicaModel');

const sanitizeName = (name) =>
  path
    .basename(name)
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 180);

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
  chunk_size: Number(chunk.chunk_size),
  chunk_hash: chunk.chunk_hash,
  chunk_status: chunk.chunk_status
});

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

const downloadChunk = async (req, res, next) => {
  try {
    const chunkId = toNumber(req.params.chunkId);

    if (!Number.isInteger(chunkId)) {
      return res.status(400).json({ message: 'A valid chunk id is required.' });
    }

    const chunk = await getChunkByIdForUser(chunkId, req.user.id);

    if (!chunk) {
      return res.status(404).json({ message: 'Chunk not found.' });
    }

    const chunkBuffer = await downloadChunkFromCloud(chunk.chunk_path);
    const fileName = `${sanitizeName(chunk.file_name)}_chunk_${chunk.chunk_index}`;

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', String(chunkBuffer.length));
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    return res.send(chunkBuffer);
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

    const chunkBuffer = await downloadChunkFromCloud(chunk.chunk_path);
    const actualHash = calculateSha256(chunkBuffer);

    if (chunk.chunk_hash && actualHash !== chunk.chunk_hash) {
      return res.status(500).json({
        message: 'Chunk failed integrity validation and may be corrupted.'
      });
    }

    const fileName = `${sanitizeName(chunk.file_name)}.chunk_${chunk.chunk_index}.base64.txt`;
    const textPayload = [
      `file_name=${chunk.file_name}`,
      `chunk_index=${chunk.chunk_index}`,
      `chunk_size=${chunkBuffer.length}`,
      `sha256=${actualHash}`,
      'encoding=base64',
      '',
      chunkBuffer.toString('base64')
    ].join('\n');

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Length', String(Buffer.byteLength(textPayload)));
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    return res.send(textPayload);
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

    const metadata = await getFileMetadataByFileId(chunk.file_id);
    const chunkBuffer = await downloadChunkFromCloud(chunk.chunk_path);
    const actualHash = calculateSha256(chunkBuffer);

    if (chunk.chunk_hash && actualHash !== chunk.chunk_hash) {
      return res.status(500).json({
        message: 'Chunk failed integrity validation and may be corrupted.'
      });
    }

    const preview = buildTextPreview({
      buffer: chunkBuffer,
      contentType: metadata?.content_type || '',
      fileName: chunk.file_name
    });

    return res.json({
      chunk: formatChunk(chunk),
      contentType: metadata?.content_type || 'application/octet-stream',
      mode: preview.mode,
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
    if (chunks.length !== file.chunk_count) {
      return res.status(409).json({
        message: 'This file is missing one or more chunks and cannot be reconstructed.'
      });
    }

    const mergedFile = await mergeChunks(chunks);
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
  downloadChunk,
  downloadChunkText,
  getChunkTextPreview,
  listFiles,
  downloadFile,
  deleteFile,
  analytics
};
