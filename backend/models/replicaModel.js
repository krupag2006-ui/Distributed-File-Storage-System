const pool = require('../config/db');

const createReplica = async ({ chunkId, bucket, replicaPath, replicaStatus = 'active' }) => {
  const [result] = await pool.execute(
    `INSERT INTO replicas (chunk_id, bucket, replica_path, replica_status)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       replica_status = VALUES(replica_status),
       last_verified_at = CURRENT_TIMESTAMP`,
    [chunkId, bucket, replicaPath, replicaStatus]
  );

  return result.insertId;
};

const createReplicas = async (replicas) => {
  if (!replicas.length) return 0;

  const values = replicas.map((replica) => [
    replica.chunkId,
    replica.bucket,
    replica.replicaPath,
    replica.replicaStatus || 'active'
  ]);

  const [result] = await pool.query(
    `INSERT INTO replicas (chunk_id, bucket, replica_path, replica_status)
     VALUES ?
     ON DUPLICATE KEY UPDATE
       replica_status = VALUES(replica_status),
       last_verified_at = CURRENT_TIMESTAMP`,
    [values]
  );

  return result.affectedRows;
};

const getReplicasByFile = async (fileId) => {
  const [rows] = await pool.execute(
    `SELECT
       replicas.id,
       replicas.chunk_id,
       replicas.bucket,
       replicas.replica_path,
       replicas.replica_status,
       replicas.last_verified_at,
       replicas.created_at,
       chunks.chunk_index
     FROM replicas
     INNER JOIN chunks ON chunks.id = replicas.chunk_id
     WHERE chunks.file_id = ?
     ORDER BY chunks.chunk_index ASC, replicas.id ASC`,
    [fileId]
  );

  return rows;
};

const getReplicaSummaryByFile = async (fileId) => {
  const [rows] = await pool.execute(
    `SELECT
       chunks.id AS chunk_id,
       chunks.chunk_index,
       COUNT(replicas.id) AS replica_count,
       SUM(replicas.replica_status = 'active') AS active_replica_count,
       MAX(replicas.last_verified_at) AS last_verified_at
     FROM chunks
     LEFT JOIN replicas ON replicas.chunk_id = chunks.id
     WHERE chunks.file_id = ?
     GROUP BY chunks.id
     ORDER BY chunks.chunk_index ASC`,
    [fileId]
  );

  return rows;
};

const getReplicasByChunk = async (chunkId) => {
  const [rows] = await pool.execute(
    `SELECT id, chunk_id, bucket, replica_path, replica_status, last_verified_at, created_at
     FROM replicas
     WHERE chunk_id = ?
     ORDER BY id ASC`,
    [chunkId]
  );

  return rows;
};

const updateReplicaHealth = async ({ replicaId, status }) => {
  const [result] = await pool.execute(
    `UPDATE replicas
     SET replica_status = ?, last_verified_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [status, replicaId]
  );

  return result.affectedRows;
};

const deleteReplicasByFile = async (fileId) => {
  const [result] = await pool.execute(
    `DELETE replicas FROM replicas
     INNER JOIN chunks ON chunks.id = replicas.chunk_id
     WHERE chunks.file_id = ?`,
    [fileId]
  );
  return result.affectedRows;
};

module.exports = {
  createReplica,
  createReplicas,
  getReplicasByFile,
  getReplicaSummaryByFile,
  getReplicasByChunk,
  updateReplicaHealth,
  deleteReplicasByFile
};
