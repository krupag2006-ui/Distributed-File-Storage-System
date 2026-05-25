const mysql = require('mysql2/promise');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const requiredDatabaseEnv = ['DB_HOST', 'DB_USER', 'DB_NAME'];
const missingDatabaseEnv = requiredDatabaseEnv.filter((key) => !process.env[key]);

if (process.env.NODE_ENV === 'production' && missingDatabaseEnv.length) {
  throw new Error(`Missing required database environment variables: ${missingDatabaseEnv.join(', ')}`);
}

const databaseName = process.env.DB_NAME || 'distributed_file_storage';
const baseDatabaseConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || ''
};

const escapeIdentifier = (identifier) => {
  if (!/^[a-zA-Z0-9_$]+$/.test(identifier)) {
    throw new Error(`Invalid database name: ${identifier}`);
  }

  return `\`${identifier}\``;
};

const ensureDatabaseExists = async () => {
  const connection = await mysql.createConnection(baseDatabaseConfig);

  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS ${escapeIdentifier(databaseName)}
       CHARACTER SET utf8mb4
       COLLATE utf8mb4_unicode_ci`
    );
  } finally {
    await connection.end();
  }
};

const pool = mysql.createPool({
  ...baseDatabaseConfig,
  database: databaseName,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool;
module.exports.ensureDatabaseExists = ensureDatabaseExists;
