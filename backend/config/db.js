const mysql = require('mysql2/promise');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const requiredDatabaseEnv = ['DB_HOST', 'DB_USER', 'DB_NAME'];
const missingDatabaseEnv = requiredDatabaseEnv.filter((key) => !process.env[key]);

if (process.env.NODE_ENV === 'production' && missingDatabaseEnv.length) {
  throw new Error(`Missing required database environment variables: ${missingDatabaseEnv.join(', ')}`);
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'distributed_file_storag',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool;
