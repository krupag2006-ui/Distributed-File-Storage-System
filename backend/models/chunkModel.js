const pool = require('../config/db');

const createChunk = async ({ fileId, chunkIndex, chunkPath, chunkSize, chunkHash }) => {
  const [result] = await pool.execute(
    `INSERT INTO chunks (file_id, chunk_index, chunk_path, chunk_size, chunk_hash, chunk_status)
     VALUES (?, ?, ?, ?, ?, 'healthy')
     ON DUPLICATE KEY UPDATE
       chunk_path = VALUES(chunk_path),
       chunk_size = VALUES(chunk_size),
       chunk_hash = VALUES(chunk_hash),
       chunk_status = 'healthy'`,
    [fileId, chunkIndex, chunkPath, chunkSize, chunkHash]
  );

  return result.insertId;
};

const createOrUpdateChunk = async ({ fileId, chunkIndex, chunkPath, chunkSize, chunkHash }) => {
  const [result] = await pool.execute(
    `INSERT INTO chunks (file_id, chunk_index, chunk_path, chunk_size, chunk_hash, chunk_status)
     VALUES (?, ?, ?, ?, ?, 'healthy')
     ON DUPLICATE KEY UPDATE
       chunk_path = VALUES(chunk_path),
       chunk_size = VALUES(chunk_size),
       chunk_hash = VALUES(chunk_hash),
       chunk_status = 'healthy'`,
    [fileId, chunkIndex, chunkPath, chunkSize, chunkHash]
  );
  return result.insertId;
};

const createChunks = async (chunks) => {
  if (!chunks.length) return 0;

  const values = chunks.map((chunk) => [
    chunk.fileId,
    chunk.chunkIndex,
    chunk.chunkPath,
    chunk.chunkSize,
    chunk.chunkHash
  ]);

  const [result] = await pool.query(
    `INSERT INTO chunks (file_id, chunk_index, chunk_path, chunk_size, chunk_hash, chunk_status)
     VALUES ?
     ON DUPLICATE KEY UPDATE
       chunk_path = VALUES(chunk_path),
       chunk_size = VALUES(chunk_size),
       chunk_hash = VALUES(chunk_hash),
       chunk_status = 'healthy'`,
    [values]
  );

  return result.affectedRows;
};

const getChunksByFile = async (fileId) => {
  const [rows] = await pool.execute(
    `SELECT id, file_id, chunk_index, chunk_path, chunk_size, chunk_hash, chunk_status
     FROM chunks
     WHERE file_id = ?
     ORDER BY chunk_index ASC`,
    [fileId]
  );
  return rows;
};

const getChunkByIdForUser = async (chunkId, userId) => {
  const [rows] = await pool.execute(
    `SELECT
       chunks.id,
       chunks.file_id,
       chunks.chunk_index,
       chunks.chunk_path,
       chunks.chunk_size,
       chunks.chunk_hash,
       chunks.chunk_status,
       files.file_name,
       files.user_id
     FROM chunks
     INNER JOIN files ON files.id = chunks.file_id
     WHERE chunks.id = ? AND files.user_id = ?`,
    [chunkId, userId]
  );

  return rows[0];
};

const updateChunkHealth = async ({ chunkId, status }) => {
  const [result] = await pool.execute(
    `UPDATE chunks
     SET chunk_status = ?, last_verified_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [status, chunkId]
  );

  return result.affectedRows;
};

const deleteChunksByFile = async (fileId) => {
  const [result] = await pool.execute('DELETE FROM chunks WHERE file_id = ?', [fileId]);
  return result.affectedRows;
};

module.exports = {
  createChunk,
  createOrUpdateChunk,
  createChunks,
  getChunksByFile,
  getChunkByIdForUser,
  updateChunkHealth,
  deleteChunksByFile
};
