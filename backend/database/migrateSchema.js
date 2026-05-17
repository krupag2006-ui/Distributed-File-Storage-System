const pool = require('../config/db');

const primaryStorageBucket = process.env.SUPABASE_PRIMARY_BUCKET || process.env.SUPABASE_BUCKET || 'chunks';

const getColumns = async (tableName) => {
  const [rows] = await pool.execute(
    `SELECT COLUMN_NAME, IS_NULLABLE
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [tableName]
  );

  return new Map(rows.map((row) => [row.COLUMN_NAME, row]));
};

const ensureTable = async (createSql) => {
  await pool.execute(createSql);
};

const ensureColumn = async (tableName, columnName, definition) => {
  const columns = await getColumns(tableName);
  if (!columns.has(columnName)) {
    await pool.execute(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`);
  }
};

const ensureLocalChunkSchema = async () => {
  const columns = await getColumns('chunks');

  if (!columns.size) {
    return;
  }

  if (!columns.has('chunk_path')) {
    await pool.execute('ALTER TABLE chunks ADD COLUMN chunk_path VARCHAR(1024) NULL AFTER chunk_index');
  }

  if (!columns.has('storage_bucket')) {
    await pool.execute('ALTER TABLE chunks ADD COLUMN storage_bucket VARCHAR(100) NULL AFTER chunk_path');
  }

  await pool.execute(
    'UPDATE chunks SET storage_bucket = ? WHERE storage_bucket IS NULL OR storage_bucket = ?',
    [primaryStorageBucket, '']
  );

  if (!columns.has('chunk_size')) {
    await pool.execute('ALTER TABLE chunks ADD COLUMN chunk_size BIGINT UNSIGNED NULL AFTER storage_bucket');
  }

  if (!columns.has('chunk_hash')) {
    await pool.execute('ALTER TABLE chunks ADD COLUMN chunk_hash VARCHAR(128) NULL AFTER chunk_size');
  }

  if (!columns.has('chunk_status')) {
    await pool.execute("ALTER TABLE chunks ADD COLUMN chunk_status VARCHAR(32) NOT NULL DEFAULT 'healthy' AFTER chunk_hash");
  }

  if (!columns.has('last_verified_at')) {
    await pool.execute('ALTER TABLE chunks ADD COLUMN last_verified_at TIMESTAMP NULL AFTER chunk_status');
  }

  if (columns.has('s3_location') && columns.get('s3_location').IS_NULLABLE === 'NO') {
    await pool.execute('ALTER TABLE chunks MODIFY COLUMN s3_location VARCHAR(1024) NULL');
  }
};

const ensureExtendedSchema = async () => {
  await ensureTable(`
    CREATE TABLE IF NOT EXISTS file_metadata (
      id INT AUTO_INCREMENT PRIMARY KEY,
      file_id INT NOT NULL UNIQUE,
      content_type VARCHAR(255),
      checksum VARCHAR(128),
      status VARCHAR(32) NOT NULL DEFAULT 'healthy',
      last_verified_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_file_metadata_file_id (file_id),
      CONSTRAINT fk_file_metadata_file
        FOREIGN KEY (file_id) REFERENCES files(id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);

  await ensureTable(`
    CREATE TABLE IF NOT EXISTS replicas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      chunk_id INT NOT NULL,
      bucket VARCHAR(100) NOT NULL,
      replica_path VARCHAR(500) NOT NULL,
      replica_status VARCHAR(32) NOT NULL DEFAULT 'active',
      last_verified_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_chunk_replica (chunk_id, bucket, replica_path),
      INDEX idx_replicas_chunk_id (chunk_id),
      CONSTRAINT fk_replicas_chunk
        FOREIGN KEY (chunk_id) REFERENCES chunks(id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);

  await ensureTable(`
    CREATE TABLE IF NOT EXISTS shared_files (
      id INT AUTO_INCREMENT PRIMARY KEY,
      file_id INT NOT NULL,
      owner_id INT NOT NULL,
      share_token VARCHAR(128) NOT NULL UNIQUE,
      access_type VARCHAR(32) NOT NULL DEFAULT 'download',
      expiry_date DATETIME NULL,
      is_public BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_shared_files_owner_id (owner_id),
      CONSTRAINT fk_shared_files_file
        FOREIGN KEY (file_id) REFERENCES files(id)
        ON DELETE CASCADE,
      CONSTRAINT fk_shared_files_owner
        FOREIGN KEY (owner_id) REFERENCES users(id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);

  await ensureTable(`
    CREATE TABLE IF NOT EXISTS permissions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      shared_file_id INT NOT NULL,
      user_id INT NULL,
      permission_type VARCHAR(32) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_permissions_shared_file_id (shared_file_id),
      CONSTRAINT fk_permissions_shared_file
        FOREIGN KEY (shared_file_id) REFERENCES shared_files(id)
        ON DELETE CASCADE,
      CONSTRAINT fk_permissions_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE SET NULL
    ) ENGINE=InnoDB;
  `);
};

module.exports = {
  ensureLocalChunkSchema,
  ensureExtendedSchema
};
