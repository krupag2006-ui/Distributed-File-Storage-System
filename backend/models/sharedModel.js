const pool = require('../config/db');

const createShare = async ({ fileId, ownerId, shareToken, accessType, expiryDate, isPublic }) => {
  const [result] = await pool.execute(
    `INSERT INTO shared_files (file_id, owner_id, share_token, access_type, expiry_date, is_public)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [fileId, ownerId, shareToken, accessType, expiryDate, isPublic ? 1 : 0]
  );

  return result.insertId;
};

const getShareByToken = async (shareToken) => {
  const [rows] = await pool.execute(
    `SELECT
       shared_files.id,
       shared_files.file_id,
       shared_files.owner_id,
       shared_files.share_token,
       shared_files.access_type,
       shared_files.expiry_date,
       shared_files.is_public,
       shared_files.created_at,
       files.file_name,
       files.file_size,
       files.chunk_count,
       files.upload_date,
       users.name AS owner_name,
       users.email AS owner_email
     FROM shared_files
     INNER JOIN files ON files.id = shared_files.file_id
     INNER JOIN users ON users.id = shared_files.owner_id
     WHERE shared_files.share_token = ?`,
    [shareToken]
  );

  return rows[0];
};

const getSharedFilesByOwner = async (ownerId) => {
  const [rows] = await pool.execute(
    `SELECT
       shared_files.id,
       shared_files.file_id,
       shared_files.share_token,
       shared_files.access_type,
       shared_files.expiry_date,
       shared_files.is_public,
       shared_files.created_at,
       files.file_name,
       files.file_size,
       files.chunk_count
     FROM shared_files
     INNER JOIN files ON files.id = shared_files.file_id
     WHERE shared_files.owner_id = ?
     ORDER BY shared_files.created_at DESC`,
    [ownerId]
  );

  return rows;
};

const updateShare = async ({ shareId, ownerId, accessType, expiryDate, isPublic }) => {
  const [result] = await pool.execute(
    `UPDATE shared_files
     SET access_type = ?, expiry_date = ?, is_public = ?
     WHERE id = ? AND owner_id = ?`,
    [accessType, expiryDate, isPublic ? 1 : 0, shareId, ownerId]
  );

  return result.affectedRows;
};

const deleteShare = async (shareId, ownerId) => {
  const [result] = await pool.execute(
    `DELETE FROM shared_files WHERE id = ? AND owner_id = ?`,
    [shareId, ownerId]
  );

  return result.affectedRows;
};

const createPermission = async ({ sharedFileId, userId = null, permissionType }) => {
  const [result] = await pool.execute(
    `INSERT INTO permissions (shared_file_id, user_id, permission_type)
     VALUES (?, ?, ?)`,
    [sharedFileId, userId, permissionType]
  );

  return result.insertId;
};

const getPermissionsByShareId = async (sharedFileId) => {
  const [rows] = await pool.execute(
    `SELECT id, shared_file_id, user_id, permission_type, created_at
     FROM permissions
     WHERE shared_file_id = ?`,
    [sharedFileId]
  );

  return rows;
};

const updatePermissionType = async ({ permissionId, permissionType }) => {
  const [result] = await pool.execute(
    `UPDATE permissions SET permission_type = ? WHERE id = ?`,
    [permissionType, permissionId]
  );

  return result.affectedRows;
};

module.exports = {
  createShare,
  getShareByToken,
  getSharedFilesByOwner,
  updateShare,
  deleteShare,
  createPermission,
  getPermissionsByShareId,
  updatePermissionType
};
