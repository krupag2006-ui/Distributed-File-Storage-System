CREATE DATABASE IF NOT EXISTS distributed_file_storage
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE distributed_file_storage;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(180) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS files (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_size BIGINT UNSIGNED NOT NULL,
  chunk_count INT UNSIGNED NOT NULL,
  upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_files_user_id (user_id),
  CONSTRAINT fk_files_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS chunks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  file_id INT NOT NULL,
  chunk_index INT UNSIGNED NOT NULL,
  chunk_path VARCHAR(1024) NOT NULL,
  storage_bucket VARCHAR(100) NOT NULL DEFAULT 'chunks',
  chunk_size BIGINT UNSIGNED NOT NULL,
  chunk_hash VARCHAR(128) NOT NULL,
  chunk_status VARCHAR(32) NOT NULL DEFAULT 'healthy',
  last_verified_at TIMESTAMP NULL,
  UNIQUE KEY unique_file_chunk (file_id, chunk_index),
  INDEX idx_chunks_file_id (file_id),
  CONSTRAINT fk_chunks_file
    FOREIGN KEY (file_id) REFERENCES files(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

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
