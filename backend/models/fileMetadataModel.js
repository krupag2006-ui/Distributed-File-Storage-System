const pool = require('../config/db');

const createFileMetadata = async ({ fileId, contentType, checksum, status = 'healthy' }) => {
  const [result] = await pool.execute(
    `INSERT INTO file_metadata (file_id, content_type, checksum, status)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       content_type = VALUES(content_type),
       checksum = VALUES(checksum),
       status = VALUES(status),
       last_verified_at = CURRENT_TIMESTAMP`,
    [fileId, contentType, checksum, status]
  );

  return result.insertId;
};

const getFileMetadataByFileId = async (fileId) => {
  const [rows] = await pool.execute(
    `SELECT id, file_id, content_type, checksum, status, last_verified_at, created_at
     FROM file_metadata
     WHERE file_id = ?`,
    [fileId]
  );

  return rows[0];
};

const markFileMetadataVerified = async (fileId, status = 'healthy') => {
  const [result] = await pool.execute(
    `UPDATE file_metadata
     SET status = ?, last_verified_at = CURRENT_TIMESTAMP
     WHERE file_id = ?`,
    [status, fileId]
  );

  return result.affectedRows;
};

module.exports = {
  createFileMetadata,
  getFileMetadataByFileId,
  markFileMetadataVerified
};
