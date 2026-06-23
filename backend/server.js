const cors = require('cors');
const dotenv = require('dotenv');
const express = require('express');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const authRoutes = require('./routes/authRoutes');
const downloadRoutes = require('./routes/downloadRoutes');
const fileRoutes = require('./routes/fileRoutes');
const replicaRoutes = require('./routes/replicaRoutes');
const shareRoutes = require('./routes/shareRoutes');
const { ensureBaseSchema, ensureLocalChunkSchema, ensureExtendedSchema } = require('./database/migrateSchema');
const pool = require('./config/db');

const app = express();
const port = process.env.PORT || 5000;
const normalizeOrigin = (origin) => origin.replace(/\/+$/, '').toLowerCase();
const allowedOrigins = (process.env.CLIENT_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const normalizedAllowedOrigins = allowedOrigins.map(normalizeOrigin);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || !normalizedAllowedOrigins.length || normalizedAllowedOrigins.includes(normalizeOrigin(origin))) {
        return callback(null, true);
      }

      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    optionsSuccessStatus: 204,
    exposedHeaders: ['Content-Disposition', 'Content-Length', 'Content-Type']
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.send('Backend API Running Successfully');
});

app.get('/health', async (req, res) => {
  try {
    await pool.execute('SELECT 1');

    // Check Supabase connection
    const { supabase } = require('./config/supabase');
    if (supabase) {
      const { data, error } = await supabase.storage.listBuckets();
      if (error) {
        return res.status(503).json({ 
          status: 'degraded', 
          service: 'distributed-file-storage-api',
          database: 'ok',
          storage: 'error',
          error: error.message
        });
      }
    }

    res.json({ 
      status: 'ok', 
      service: 'distributed-file-storage-api',
      database: 'ok',
      storage: 'ok'
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'error', 
      service: 'distributed-file-storage-api',
      error: error.message
    });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/replicas', replicaRoutes);
app.use('/api/share', shareRoutes);
app.use('/api', replicaRoutes);
app.use('/api', shareRoutes);
app.use('/api', downloadRoutes);

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found.' });
});

app.use((error, req, res, next) => {
  if (error.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ message: 'File exceeds the configured maximum upload size.' });
  }

  const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;

  console.error(error);
  return res.status(statusCode).json({
    message: error.message || 'Something went wrong on the server.'
  });
});
const startServer = async () => {
  try {
    await ensureBaseSchema();
    await ensureLocalChunkSchema();
    await ensureExtendedSchema();

    app.listen(port, '0.0.0.0', () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (error) {
    console.error('Unable to start server:', error);
    process.exit(1);
  }
};

startServer();
