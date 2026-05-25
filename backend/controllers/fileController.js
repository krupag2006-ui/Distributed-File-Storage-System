const path = require('path');
const { chunkFile, DEFAULT_CHUNK_SIZE } = require('../utils/chunkFile');
const mergeChunks = require('../utils/mergeChunks');
const {
  buildChunkPath,
  deleteChunksFromCloud,
  downloadChunkFromCloud,
  listChunksFromCloud,
  normalizeStoragePath,
  uploadChunkToCloud
} = require('../utils/supabaseStorage');
const { calculateSha256 } = require('../utils/fileHash');
const {
  buildChunkPreviewFromStoredText,
  buildDirectChunkPreview,
  buildStoredFilePreview,
  isDocument,
  isTextLike,
  isZipArchive
} = require('../utils/textPreview');
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
const {
  createFileMetadata,
  getFileMetadataByFileId
} = require('../models/fileMetadataModel');
const { createReplicas, getReplicasByChunk, getReplicasByFile } = require('../models/replicaModel');

const sanitizeName = (name) =>
  path
    .basename(name)
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 180);

const toNumber = (value) => Number.parseInt(value, 10);

const MIME_TYPES_BY_EXTENSION = {
  '.aac': 'audio/aac',
  '.avi': 'video/x-msvideo',
  '.bin': 'application/octet-stream',
  '.bmp': 'image/bmp',
  '.csv': 'text/csv; charset=utf-8',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.json': 'application/json; charset=utf-8',
  '.m4a': 'audio/mp4',
  '.md': 'text/markdown; charset=utf-8',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.zip': 'application/zip'
};

const extensionOf = (fileName = '') => path.extname(fileName).toLowerCase();

const resolveContentType = ({ metadata, fileName, fallback = 'application/octet-stream' }) => {
  const storedType = metadata?.content_type;

  if (storedType && storedType !== 'application/octet-stream') {
    return storedType;
  }

  return MIME_TYPES_BY_EXTENSION[extensionOf(fileName)] || storedType || fallback;
};

const attachmentDisposition = (fileName) => {
  const safeFileName = sanitizeName(fileName || 'download');
  return `attachment; filename="${safeFileName}"; filename*=UTF-8''${encodeURIComponent(fileName || safeFileName)}`;
};

const setAttachmentHeaders = ({ res, fileName, contentType, contentLength }) => {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', attachmentDisposition(fileName));
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (Number.isFinite(contentLength)) {
    res.setHeader('Content-Length', String(contentLength));
  }
};

const formatAnalytics = (analytics) => ({
  totalFiles: Number(analytics.total_files || 0),
  totalStorage: Number(analytics.total_storage || 0),
  averageFileSize: Number(analytics.average_file_size || 0),
  totalChunks: Number(analytics.total_chunks || 0)
});

const formatChunk = (chunk) => ({
  id: chunk.id,
  file_id: chunk.file_id,
  file_name: chunk.file_name,
  file_size: chunk.file_size !== undefined ? Number(chunk.file_size) : undefined,
  chunk_index: chunk.chunk_index,
  chunk_count: chunk.chunk_count,
  chunk_path: chunk.chunk_path,
  storage_bucket: chunk.storage_bucket || supabasePrimaryBucket,
  chunk_size: Number(chunk.chunk_size),
  chunk_hash: chunk.chunk_hash,
  chunk_status: chunk.chunk_status,
  storage_found: chunk.storage_found,
  cloud_path: chunk.cloud_path,
  preview: chunk.preview
});

const downloadChunkIndex = (chunkIndex) => {
  const numericIndex = Number(chunkIndex);

  if (!Number.isInteger(numericIndex)) {
    return 0;
  }

  return numericIndex > 0 ? numericIndex - 1 : numericIndex;
};

const sanitizeExtension = (extension, fallback = '.bin') => {
  const normalizedExtension = String(extension || '').toLowerCase();
  return /^\.[a-z0-9]+$/.test(normalizedExtension) ? normalizedExtension : fallback;
};

const buildChunkDownloadName = ({ fileName, chunkIndex, extension }) => {
  const chunkExtension = sanitizeExtension(extension || extensionOf(fileName), '.bin');
  return `chunk_${downloadChunkIndex(chunkIndex)}${chunkExtension}`;
};

const isLegacyOfficeDocument = ({ contentType = '', fileName = '' }) => {
  const normalizedType = contentType.toLowerCase();
  const extension = extensionOf(fileName);

  return (
    extension === '.doc' ||
    extension === '.ppt' ||
    normalizedType.includes('msword') ||
    normalizedType.includes('powerpoint')
  );
};

const shouldDownloadChunkAsPreviewText = ({ contentType = '', fileName = '' }) =>
  isTextLike({ contentType, fileName }) ||
  isDocument({ contentType, fileName }) ||
  isZipArchive({ contentType, fileName }) ||
  isLegacyOfficeDocument({ contentType, fileName });

const readableTextUnavailableError = () => {
  const error = new Error('Readable preview text is not available for this chunk.');
  error.statusCode = 409;
  return error;
};

const sameStoragePath = (first, second) =>
  normalizeStoragePath(first || '') === normalizeStoragePath(second || '');

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

const buildPreviewForFullFile = async ({ buffer, fileName, contentType }) => {
  const preview = await buildStoredFilePreview({
    buffer,
    fileName,
    contentType
  });

  return {
    previewText: preview.hasReadableText ? preview.text : '',
    previewMode: preview.hasReadableText ? preview.mode : null,
    preview
  };
};

const buildChunkPreviewFromMetadata = ({ chunk, metadata, maxChars }) => {
  if (!metadata?.preview_text) {
    return null;
  }

  return buildChunkPreviewFromStoredText({
    previewText: metadata.preview_text,
    previewMode: metadata.preview_mode,
    fileName: chunk.file_name,
    chunkIndex: chunk.chunk_index,
    chunkCount: chunk.chunk_count,
    maxChars
  });
};

const getReadableChunkText = async ({ chunk, maxChars }) => {
  const metadata = await getFileMetadataByFileId(chunk.file_id);
  const contentType = resolveContentType({ metadata, fileName: chunk.file_name });
  const metadataPreview = buildChunkPreviewFromMetadata({ chunk, metadata, maxChars });

  if (metadataPreview) {
    return {
      contentType,
      preview: metadataPreview
    };
  }

  if (!shouldDownloadChunkAsPreviewText({ contentType, fileName: chunk.file_name })) {
    return {
      contentType,
      preview: await buildDirectChunkPreview({
        buffer: (await getChunkBuffer(chunk)).chunkBuffer,
        contentType,
        fileName: chunk.file_name,
        maxChars
      })
    };
  }

  const { chunkBuffer } = await getChunkBuffer(chunk);

  return {
    contentType,
    preview: await buildDirectChunkPreview({
      buffer: chunkBuffer,
      contentType,
      fileName: chunk.file_name,
      maxChars
    })
  };
};

const buildDownloadableChunkText = async ({
  chunk,
  metadata,
  contentType,
  chunkBuffer,
  maxChars = Number.MAX_SAFE_INTEGER
}) => {
  const metadataPreview = buildChunkPreviewFromMetadata({
    chunk,
    metadata,
    maxChars
  });

  if (metadataPreview?.hasReadableText && metadataPreview.text) {
    return metadataPreview.text;
  }

  if (isTextLike({ contentType, fileName: chunk.file_name })) {
    const directPreview = await buildDirectChunkPreview({
      buffer: chunkBuffer,
      contentType,
      fileName: chunk.file_name,
      maxChars
    });

    if (directPreview.hasReadableText && directPreview.text) {
      return directPreview.text;
    }
  }

  throw readableTextUnavailableError();
};

const syncCloudChunksToDatabase = async ({ file, dbChunks, cloudChunks }) => {
  const retrievalErrors = [];
  const dbByIndex = new Map(dbChunks.map((chunk) => [Number(chunk.chunk_index), chunk]));

  for (const cloudChunk of cloudChunks) {
    const dbChunk = dbByIndex.get(Number(cloudChunk.chunkIndex));

    if (dbChunk && sameStoragePath(dbChunk.chunk_path, cloudChunk.chunkPath)) {
      continue;
    }

    try {
      const chunkBuffer = await downloadChunkFromCloud(cloudChunk.chunkPath, {
        bucket: cloudChunk.bucket,
        fileId: file.id,
        chunkIndex: cloudChunk.chunkIndex
      });

      await createChunk({
        fileId: file.id,
        chunkIndex: cloudChunk.chunkIndex,
        chunkPath: cloudChunk.chunkPath,
        storageBucket: cloudChunk.bucket,
        chunkSize: cloudChunk.size || chunkBuffer.length,
        chunkHash: calculateSha256(chunkBuffer)
      });
    } catch (error) {
      retrievalErrors.push(`Unable to sync ${cloudChunk.bucket}/${cloudChunk.chunkPath}: ${error.message}`);
    }
  }

  return retrievalErrors;
};

const getCloudChunkListing = async (fileId) => {
  try {
    const cloudChunks = await listChunksFromCloud(fileId, supabasePrimaryBucket);
    return {
      cloudChunks,
      retrievalErrors: []
    };
  } catch (error) {
    return {
      cloudChunks: [],
      retrievalErrors: [error.message]
    };
  }
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

    const contentType = resolveContentType({
      metadata: { content_type: req.file.mimetype },
      fileName
    });
    const { previewText, previewMode } = await buildPreviewForFullFile({
      buffer: req.file.buffer,
      fileName,
      contentType
    });

    const fileMetadata = await createFileMetadata({
      fileId: createdFileId,
      contentType,
      checksum: calculateSha256(req.file.buffer),
      previewText,
      previewMode
    });

    const chunks = await getChunksByFile(createdFileId);
    const file = await getFileByIdForUser(createdFileId, req.user.id);
    const metadataForPreview = {
      content_type: contentType,
      preview_text: previewText,
      preview_mode: previewMode
    };

    return res.status(201).json({
      message: 'File uploaded, split into chunks, and saved successfully.',
      file,
      metadata: fileMetadata,
      chunks: chunks.map((chunk) =>
        formatChunk({
          ...chunk,
          file_name: fileName,
          chunk_count: chunkCount,
          preview: buildChunkPreviewFromMetadata({
            chunk: { ...chunk, file_name: fileName, chunk_count: chunkCount },
            metadata: metadataForPreview,
            maxChars: 12000
          })
        })
      )
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

    let chunks = await getChunksByFile(file.id);
    const chunkPath = `uploads/${file.id}/`;
    const bucket = supabasePrimaryBucket;
    const { cloudChunks, retrievalErrors } = await getCloudChunkListing(file.id);
    const syncErrors = await syncCloudChunksToDatabase({
      file,
      dbChunks: chunks,
      cloudChunks
    });
    retrievalErrors.push(...syncErrors);

    if (cloudChunks.length && syncErrors.length !== cloudChunks.length) {
      chunks = await getChunksByFile(file.id);
    }

    const metadata = await getFileMetadataByFileId(file.id);
    const cloudByPath = new Map(
      cloudChunks.map((chunk) => [normalizeStoragePath(chunk.chunkPath, chunk.bucket), chunk])
    );
    const cloudByIndex = new Map(cloudChunks.map((chunk) => [Number(chunk.chunkIndex), chunk]));
    const chunkCount = chunks.length || cloudChunks.length || file.chunk_count;

    console.log(file.id, chunkPath, bucket, chunkCount, retrievalErrors);

    return res.json({
      success: true,
      file,
      bucket,
      chunkPath,
      chunkCount,
      retrievalErrors,
      chunks: chunks.map((chunk) => {
        const normalizedPath = normalizeStoragePath(chunk.chunk_path, chunk.storage_bucket);
        const cloudChunk = cloudByPath.get(normalizedPath) || cloudByIndex.get(Number(chunk.chunk_index));
        const chunkWithFile = {
          ...chunk,
          file_name: file.file_name,
          file_size: file.file_size,
          chunk_count: file.chunk_count,
          storage_found: Boolean(cloudChunk),
          cloud_path: cloudChunk?.chunkPath || null
        };

        return formatChunk({
          ...chunkWithFile,
          preview: buildChunkPreviewFromMetadata({
            chunk: chunkWithFile,
            metadata,
            maxChars: 12000
          })
        });
      })
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

    const metadata = await getFileMetadataByFileId(chunk.file_id);
    const contentType = resolveContentType({ metadata, fileName: chunk.file_name });
    const { chunkBuffer } = await getChunkBuffer(chunk);
    const previewText = await buildDownloadableChunkText({
      chunk,
      metadata,
      contentType,
      chunkBuffer
    });
    const output = Buffer.from(previewText, 'utf8');

    setAttachmentHeaders({
      res,
      fileName: buildChunkDownloadName({
        chunkIndex: chunk.chunk_index,
        extension: '.txt'
      }),
      contentType: 'text/plain; charset=utf-8',
      contentLength: output.length
    });
    res.setHeader('X-Chunk-Download-Mode', 'preview-text');

    return res.end(output);
  } catch (error) {
    next(error);
  }
};

const startChunkedUpload = async (req, res, next) => {
  try {
    const fileName = sanitizeName(req.body.fileName || '');
    const fileSize = Number(req.body.fileSize);
    const chunkCount = Number(req.body.chunkCount);

    if (!fileName) {
      return res.status(400).json({ message: 'File name is required.' });
    }

    if (!Number.isInteger(fileSize) || fileSize <= 0) {
      return res.status(400).json({ message: 'A valid file size is required.' });
    }

    if (!Number.isInteger(chunkCount) || chunkCount <= 0) {
      return res.status(400).json({ message: 'A valid chunk count is required.' });
    }

    const fileId = await createFile({
      userId: req.user.id,
      fileName,
      fileSize,
      chunkCount
    });

    const file = await getFileByIdForUser(fileId, req.user.id);
    return res.status(201).json({ file, chunkSize: DEFAULT_CHUNK_SIZE });
  } catch (error) {
    next(error);
  }
};

const uploadFileChunk = async (req, res, next) => {
  try {
    const fileId = toNumber(req.params.fileId);
    const chunkIndex = toNumber(req.body.chunkIndex);

    if (!Number.isInteger(fileId)) {
      return res.status(400).json({ message: 'A valid file id is required.' });
    }

    if (!Number.isInteger(chunkIndex) || chunkIndex < 1) {
      return res.status(400).json({ message: 'A valid chunk index is required.' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'Chunk file is required.' });
    }

    const file = await getFileByIdForUser(fileId, req.user.id);

    if (!file) {
      return res.status(404).json({ message: 'File not found.' });
    }

    if (chunkIndex > file.chunk_count) {
      return res.status(400).json({ message: 'Chunk index exceeds the expected chunk count.' });
    }

    const chunkName = buildChunkPath(file.id, chunkIndex);
    const chunkHash = calculateSha256(req.file.buffer);
    const { primaryPath, replicaPaths } = await uploadChunkToCloud(req.file.buffer, chunkName);
    const chunkId = await createChunk({
      fileId: file.id,
      chunkIndex,
      chunkPath: primaryPath,
      storageBucket: supabasePrimaryBucket,
      chunkSize: req.file.size,
      chunkHash
    });

    if (replicaPaths?.length) {
      await createReplicas(
        replicaPaths.map((replica) => ({
          chunkId,
          bucket: replica.bucket,
          replicaPath: replica.path,
          replicaStatus: 'active'
        }))
      );
    }

    return res.status(201).json({
      chunk: formatChunk({
        id: chunkId,
        file_id: file.id,
        chunk_index: chunkIndex,
        chunk_path: primaryPath,
        storage_bucket: supabasePrimaryBucket,
        chunk_size: req.file.size,
        chunk_hash: chunkHash,
        chunk_status: 'healthy'
      })
    });
  } catch (error) {
    next(error);
  }
};

const completeChunkedUpload = async (req, res, next) => {
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
      return res.status(409).json({ message: validationError });
    }

    const replicas = await getReplicasByFile(file.id);
    const mergedFile = await mergeChunks(attachReplicasToChunks(chunks, replicas));
    const reconstructedHash = calculateSha256(mergedFile);

    if (req.body.checksum && req.body.checksum !== reconstructedHash) {
      return res.status(409).json({
        message: 'Uploaded chunks do not match the original file checksum. Please retry the upload.'
      });
    }

    const contentType = resolveContentType({
      metadata: { content_type: req.body.contentType },
      fileName: file.file_name
    });
    const { previewText, previewMode } = await buildPreviewForFullFile({
      buffer: mergedFile,
      fileName: file.file_name,
      contentType
    });

    const fileMetadata = await createFileMetadata({
      fileId: file.id,
      contentType,
      checksum: reconstructedHash,
      previewText,
      previewMode
    });
    const metadataForPreview = {
      content_type: contentType,
      preview_text: previewText,
      preview_mode: previewMode
    };

    return res.json({
      message: 'File uploaded, split into chunks, and saved successfully.',
      file,
      metadata: fileMetadata,
      chunks: chunks.map((chunk) =>
        formatChunk({
          ...chunk,
          file_name: file.file_name,
          file_size: file.file_size,
          chunk_count: file.chunk_count,
          preview: buildChunkPreviewFromMetadata({
            chunk: { ...chunk, file_name: file.file_name, chunk_count: file.chunk_count },
            metadata: metadataForPreview,
            maxChars: 12000
          })
        })
      )
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

    const metadata = await getFileMetadataByFileId(chunk.file_id);
    const contentType = resolveContentType({ metadata, fileName: chunk.file_name });
    const { chunkBuffer } = await getChunkBuffer(chunk);

    if (shouldDownloadChunkAsPreviewText({ contentType, fileName: chunk.file_name })) {
      const previewText = await buildDownloadableChunkText({
        chunk,
        metadata,
        contentType,
        chunkBuffer
      });
      const output = Buffer.from(previewText, 'utf8');

      setAttachmentHeaders({
        res,
        fileName: buildChunkDownloadName({
          chunkIndex: chunk.chunk_index,
          extension: '.txt'
        }),
        contentType: 'text/plain; charset=utf-8',
        contentLength: output.length
      });
      res.setHeader('X-Chunk-Download-Mode', 'preview-text');

      return res.end(output);
    }

    setAttachmentHeaders({
      res,
      fileName: buildChunkDownloadName({
        fileName: chunk.file_name,
        chunkIndex: chunk.chunk_index
      }),
      contentType,
      contentLength: chunkBuffer.length
    });
    res.setHeader('X-Chunk-Download-Mode', 'raw-chunk');

    return res.end(chunkBuffer);
  } catch (error) {
    next(error);
  }
};

const downloadChunkBinary = downloadChunk;

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
      maxChars: 12000
    });

    return res.json({
      chunk: formatChunk(chunk),
      contentType: contentType || 'application/octet-stream',
      mode: preview.mode,
      language: preview.language,
      sourceFiles: preview.sourceFiles,
      text: preview.text,
      message: preview.message,
      hasReadableText: Boolean(preview.hasReadableText),
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

const downloadFullFile = async (req, res, next) => {
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

    const contentType = resolveContentType({ metadata, fileName: file.file_name });

    setAttachmentHeaders({
      res,
      fileName: file.file_name,
      contentType,
      contentLength: mergedFile.length
    });

    res.end(mergedFile);
  } catch (error) {
    next(error);
  }
};

const downloadFile = downloadFullFile;

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
  startChunkedUpload,
  uploadFileChunk,
  completeChunkedUpload,
  getChunks,
  downloadChunk,
  downloadChunkBinary,
  downloadChunkText,
  downloadFullFile,
  getChunkTextPreview,
  listFiles,
  downloadFile,
  deleteFile,
  analytics
};
