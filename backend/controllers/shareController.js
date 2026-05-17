const crypto = require('crypto');
const path = require('path');
const { getFileByIdForUser, getFileById } = require('../models/fileModel');
const { getChunksByFile } = require('../models/chunkModel');
const { getFileMetadataByFileId } = require('../models/fileMetadataModel');
const { getReplicasByFile } = require('../models/replicaModel');
const {
  createShare,
  getShareByToken,
  getSharedFilesByOwner,
  updateShare,
  deleteShare,
  createPermission,
  getPermissionsByShareId,
  updatePermissionType
} = require('../models/sharedModel');
const mergeChunks = require('../utils/mergeChunks');
const { calculateSha256 } = require('../utils/fileHash');

const toNumber = (value) => Number.parseInt(value, 10);
const validAccessTypes = new Set(['read-only', 'download', 'edit', 'full']);

const attachReplicasToChunks = (chunks, replicas) => {
  const replicasByChunkId = new Map();

  for (const replica of replicas) {
    if (replica.replica_status && replica.replica_status !== 'active') {
      continue;
    }

    const current = replicasByChunkId.get(replica.chunk_id) || [];
    current.push({
      bucket: replica.bucket,
      path: replica.replica_path
    });
    replicasByChunkId.set(replica.chunk_id, current);
  }

  return chunks.map((chunk) => ({
    ...chunk,
    replicaSources: replicasByChunkId.get(chunk.id) || []
  }));
};

const canAccessShare = async (share, user) => {
  if (share.is_public) return true;
  if (!user) return false;
  if (share.owner_id === user.id) return true;

  const permissions = await getPermissionsByShareId(share.id);
  return permissions.some((permission) => permission.user_id === user.id);
};

const createShareLink = async (req, res, next) => {
  try {
    const { fileId, accessType = 'download', expiryDate, isPublic = false } = req.body;
    const parsedFileId = toNumber(fileId);

    if (!Number.isInteger(parsedFileId)) {
      return res.status(400).json({ message: 'A valid file id is required.' });
    }

    if (!validAccessTypes.has(accessType)) {
      return res.status(400).json({ message: 'A valid access type is required.' });
    }

    const file = await getFileByIdForUser(parsedFileId, req.user.id);
    if (!file) {
      return res.status(404).json({ message: 'File not found.' });
    }

    const shareToken = crypto.randomBytes(24).toString('base64url');
    const shareId = await createShare({
      fileId: file.id,
      ownerId: req.user.id,
      shareToken,
      accessType,
      expiryDate: expiryDate || null,
      isPublic: Boolean(isPublic)
    });

    await createPermission({
      sharedFileId: shareId,
      userId: null,
      permissionType: accessType
    });

    return res.status(201).json({
      message: 'Share link created successfully.',
      share: {
        id: shareId,
        token: shareToken,
        fileId: file.id,
        fileName: file.file_name,
        accessType,
        expiryDate,
        isPublic: Boolean(isPublic)
      }
    });
  } catch (error) {
    next(error);
  }
};

const getSharedLink = async (req, res, next) => {
  try {
    const { token } = req.params;
    const share = await getShareByToken(token);

    if (!share) {
      return res.status(404).json({ message: 'Shared file not found.' });
    }

    if (share.expiry_date && new Date(share.expiry_date) < new Date()) {
      return res.status(410).json({ message: 'This share link has expired.' });
    }

    if (!(await canAccessShare(share, req.user))) {
      return res.status(403).json({ message: 'This private share link requires permission.' });
    }

    return res.json({
      share: {
        id: share.id,
        fileId: share.file_id,
        fileName: share.file_name,
        fileSize: share.file_size,
        chunkCount: share.chunk_count,
        accessType: share.access_type,
        expiryDate: share.expiry_date,
        isPublic: Boolean(share.is_public),
        ownerName: share.owner_name,
        ownerEmail: share.owner_email,
        uploadedAt: share.upload_date
      }
    });
  } catch (error) {
    next(error);
  }
};

const listSharedFiles = async (req, res, next) => {
  try {
    const sharedFiles = await getSharedFilesByOwner(req.user.id);
    return res.json({ sharedFiles });
  } catch (error) {
    next(error);
  }
};

const updateSharedPermissions = async (req, res, next) => {
  try {
    const sharedId = toNumber(req.params.id);
    const { accessType, expiryDate, isPublic } = req.body;

    if (!Number.isInteger(sharedId)) {
      return res.status(400).json({ message: 'A valid share id is required.' });
    }

    if (!validAccessTypes.has(accessType)) {
      return res.status(400).json({ message: 'A valid access type is required.' });
    }

    const updatedRows = await updateShare({
      shareId: sharedId,
      ownerId: req.user.id,
      accessType,
      expiryDate: expiryDate || null,
      isPublic: Boolean(isPublic)
    });

    if (!updatedRows) {
      return res.status(404).json({ message: 'Share link not found or not owned by you.' });
    }

    return res.json({ message: 'Share settings updated successfully.' });
  } catch (error) {
    next(error);
  }
};

const deleteSharedLink = async (req, res, next) => {
  try {
    const sharedId = toNumber(req.params.id);

    if (!Number.isInteger(sharedId)) {
      return res.status(400).json({ message: 'A valid share id is required.' });
    }

    const deletedRows = await deleteShare(sharedId, req.user.id);
    if (!deletedRows) {
      return res.status(404).json({ message: 'Share link not found or not owned by you.' });
    }

    return res.json({ message: 'Share link deleted successfully.' });
  } catch (error) {
    next(error);
  }
};

const downloadSharedFile = async (req, res, next) => {
  try {
    const { token } = req.params;
    const share = await getShareByToken(token);

    if (!share) {
      return res.status(404).json({ message: 'Shared file not found.' });
    }

    if (share.expiry_date && new Date(share.expiry_date) < new Date()) {
      return res.status(410).json({ message: 'This share link has expired.' });
    }

    if (!(await canAccessShare(share, req.user))) {
      return res.status(403).json({ message: 'This private share link requires permission.' });
    }

    if (!['download', 'edit', 'full'].includes(share.access_type)) {
      return res.status(403).json({ message: 'Download not permitted for this share.' });
    }

    const file = await getFileById(share.file_id);
    if (!file) {
      return res.status(404).json({ message: 'File not found.' });
    }

    const chunks = await getChunksByFile(file.id);
    if (chunks.length !== file.chunk_count) {
      return res.status(409).json({
        message: 'This file is missing one or more chunks and cannot be reconstructed.'
      });
    }

    const replicas = await getReplicasByFile(file.id);
    const mergedFile = await mergeChunks(attachReplicasToChunks(chunks, replicas));
    const metadata = await getFileMetadataByFileId(file.id);

    if (metadata?.checksum) {
      const reconstructedHash = calculateSha256(mergedFile);
      if (reconstructedHash !== metadata.checksum) {
        return res.status(500).json({
          message: 'File reconstruction failed integrity validation. The reconstructed file is corrupted.'
        });
      }
    }

    const safeFileName = path.basename(file.file_name).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180);
    const contentType = metadata?.content_type || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', String(mergedFile.length));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeFileName}"; filename*=UTF-8''${encodeURIComponent(file.file_name)}`
    );
    res.setHeader('Cache-Control', 'no-cache');

    res.end(mergedFile);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createShareLink,
  getSharedLink,
  listSharedFiles,
  updateSharedPermissions,
  deleteSharedLink,
  downloadSharedFile
};
