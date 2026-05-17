const pool = require('../config/db');

const createFile = async ({ userId, fileName, fileSize, chunkCount }) => {
  const [result] = await pool.execute(
    'INSERT INTO files (user_id, file_name, file_size, chunk_count) VALUES (?, ?, ?, ?)',
    [userId, fileName, fileSize, chunkCount]
  );
  return result.insertId;
};

const getFilesByUser = async (userId, search = '') => {
  const like = `%${search}%`;
  const [rows] = await pool.execute(
    `SELECT id, file_name, file_size, chunk_count, upload_date
     FROM files
     WHERE user_id = ? AND file_name LIKE ?
     ORDER BY upload_date DESC`,
    [userId, like]
  );
  return rows;
};

const getFileByIdForUser = async (fileId, userId) => {
  const [rows] = await pool.execute(
    `SELECT id, user_id, file_name, file_size, chunk_count, upload_date
     FROM files
     WHERE id = ? AND user_id = ?`,
    [fileId, userId]
  );
  return rows[0];
};

const getFileById = async (fileId) => {
  const [rows] = await pool.execute(
    `SELECT id, user_id, file_name, file_size, chunk_count, upload_date
     FROM files
     WHERE id = ?`,
    [fileId]
  );
  return rows[0];
};

const deleteFileByIdForUser = async (fileId, userId) => {
  const [result] = await pool.execute('DELETE FROM files WHERE id = ? AND user_id = ?', [
    fileId,
    userId
  ]);
  return result.affectedRows;
};

const getStorageAnalytics = async (userId) => {
  const [rows] = await pool.execute(
    `SELECT
       COUNT(*) AS total_files,
       COALESCE(SUM(file_size), 0) AS total_storage,
       COALESCE(AVG(file_size), 0) AS average_file_size,
       COALESCE(SUM(chunk_count), 0) AS total_chunks
     FROM files
     WHERE user_id = ?`,
    [userId]
  );
  return rows[0];
};

const getUploadsByDay = async (userId) => {
  const [rows] = await pool.execute(
    `SELECT DATE(upload_date) AS upload_day, COUNT(*) AS file_count, COALESCE(SUM(file_size), 0) AS storage_used
     FROM files
     WHERE user_id = ?
     GROUP BY DATE(upload_date)
     ORDER BY upload_day DESC
     LIMIT 7`,
    [userId]
  );
  return rows.reverse();
};

module.exports = {
  createFile,
  getFilesByUser,
  getFileById,
  getFileByIdForUser,
  deleteFileByIdForUser,
  getStorageAnalytics,
  getUploadsByDay
};
