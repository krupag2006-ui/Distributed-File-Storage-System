const pool = require('../config/db');

const createFileMetadata = async ({
  fileId,
  contentType,
  checksum,
  previewText = '',
  previewMode = null,
  status = 'healthy'
}) => {
  const [result] = await pool.execute(
    `INSERT INTO file_metadata (file_id, content_type, checksum, preview_text, preview_mode, status)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       content_type = VALUES(content_type),
       checksum = VALUES(checksum),
       preview_text = VALUES(preview_text),
       preview_mode = VALUES(preview_mode),
       status = VALUES(status),
       last_verified_at = CURRENT_TIMESTAMP`,
    [fileId, contentType, checksum, previewText, previewMode, status]
  );

  return result.insertId;
};

const getFileMetadataByFileId = async (fileId) => {
  const [rows] = await pool.execute(
    `SELECT id, file_id, content_type, checksum, preview_text, preview_mode, status, last_verified_at, created_at
     FROM file_metadata
     WHERE file_id = ?`,
    [fileId]
  );

  return rows[0];
};

const updateFilePreviewText = async ({ fileId, previewText = '', previewMode = null }) => {
  const [result] = await pool.execute(
    `UPDATE file_metadata
     SET preview_text = ?, preview_mode = ?, last_verified_at = CURRENT_TIMESTAMP
     WHERE file_id = ?`,
    [previewText, previewMode, fileId]
  );

  return result.affectedRows;
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
  markFileMetadataVerified,
  updateFilePreviewText
};
