# Distributed File Storage System

A full-stack web app for uploading a file, splitting it into server-side chunks, storing chunk metadata in MySQL, downloading individual chunks, and reconstructing the original file on download.

## Tech Stack

- Frontend: React.js with Vite, Tailwind CSS, Framer Motion, React Icons, Axios
- Backend: Node.js, Express.js, Multer, Supabase Storage
- Database: MySQL with `mysql2`
- Authentication: JWT and bcrypt

## Project Structure

```text
frontend/
  src/
    components/
      ChunkCard.jsx
      DownloadOptions.jsx
      FileUpload.jsx
      Navbar.jsx
      FeatureCard.jsx
      ProtectedRoute.jsx
    pages/
      Login.jsx
      Signup.jsx
      Dashboard.jsx
      Upload.jsx
      MyFiles.jsx
      Analytics.jsx
    services/
      api.js

backend/
  controllers/
    fileController.js
  database/
    schema.sql
  middleware/
    uploadMiddleware.js
  models/
    fileModel.js
    chunkModel.js
  routes/
    fileRoutes.js
  utils/
    chunkFile.js
    mergeChunks.js
    supabaseStorage.js
  server.js
```

## Database Setup

Create the MySQL database and tables:

```bash
mysql -u root -p < backend/database/schema.sql
```

The schema creates:

- `users`: account records with unique email and hashed password
- `files`: file metadata with `id`, `file_name`, `file_size`, `chunk_count`, and `upload_date`
- `chunks`: chunk metadata with `chunk_path`, `chunk_size`, `chunk_hash`, and health status
- `file_metadata`: MIME type, full-file checksum, and verification status
- `replicas`: backup bucket paths and replica health records for each chunk
- `shared_files`: secure share tokens, access type, expiry date, and public/private state
- `permissions`: per-share permission records

## Backend Setup

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Edit `backend/.env` with your MySQL and JWT values:

```env
PORT=5000
CLIENT_URL=http://localhost:5173
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=distributed_file_storage
JWT_SECRET=replace_with_a_long_random_secret
JWT_EXPIRES_IN=1d
MAX_UPLOAD_SIZE_BYTES=536870912
CHUNK_SIZE_BYTES=10485760
SUPABASE_URL=your_project_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_BUCKET=chunks
SUPABASE_PRIMARY_BUCKET=chunks
SUPABASE_REPLICA_BUCKETS=chunks_backup
```

Uploaded chunks are written to the configured primary Supabase Storage bucket. If `SUPABASE_REPLICA_BUCKETS` is set to a comma-separated list of backup buckets, each uploaded chunk is copied to those buckets and tracked in `replicas`.

Use the Supabase `service_role` key only in the backend environment. This project uses its own JWT auth, not Supabase Auth, so Storage uploads made from the Express server will still be treated as anonymous by Supabase if you use the `anon` key, which commonly triggers `new row violates row-level security policy` errors.

Create all primary and replica buckets in Supabase before starting the API. Keep them private; the Express API performs authenticated uploads/downloads with the service role key.

## Frontend Setup

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Frontend URL: `http://localhost:5173`

## Upload And Download Flow

1. React sends the selected file to `POST /api/files/upload`.
2. Express receives the file with Multer.
3. `chunkFile.js` slices the file buffer into 10 MB chunks and uploads each chunk to Supabase Storage.
4. MySQL stores the original file row in `files`, ordered Supabase chunk paths in `chunks`, chunk hashes, full-file metadata, and replica records.
5. `GET /api/files/chunks/:fileId` returns stored chunk metadata.
6. `GET /api/files/download-chunk/:chunkId` downloads one chunk object from Supabase and returns it.
7. `GET /api/files/download-file/:fileId` downloads all chunk objects by `chunk_index`, verifies chunk hashes, merges buffers with `Buffer.concat()`, validates the reconstructed file checksum, and returns the original file with its MIME type.
8. If a primary chunk is missing, the storage utility tries replica buckets and restores the primary chunk automatically.

## Replication And Recovery

- New uploads automatically create replica copies in `SUPABASE_REPLICA_BUCKETS`.
- `POST /api/replicas/replicate` or `POST /api/replicate` backfills missing replicas for an existing file.
- `GET /api/replicas/replica-status/:fileId` or `GET /api/replica-status/:fileId` returns chunk and replica health.
- `GET /api/replicas/replica-health?fileId=:fileId` or `GET /api/replica-health?fileId=:fileId` checks replica coverage.
- `POST /api/replicas/recover/:fileId` or `POST /api/recover/:fileId` verifies primary chunks and restores missing/corrupt chunks from a healthy replica when possible.

Example body for replication:

```json
{
  "fileId": 1
}
```

## File Sharing

- Use the Share button on My Files to create a tokenized link.
- Links can be public or private, can expire, and support `read-only`, `download`, `edit`, and `full` access values.
- Shared links are listed in Shared Files, where access type, expiry date, public/private status, copy link, and revoke actions are available.
- Public shared file URLs use `/shared/:token`. Private links require an authenticated user with permission or the owner account.

## API Routes

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/auth/profile`
- `POST /api/files/upload`
- `GET /api/files/chunks/:fileId`
- `GET /api/files/download-chunk/:chunkId`
- `GET /api/files/download-file/:fileId`
- `GET /api/files/:fileId/download`
- `GET /api/files`
- `DELETE /api/files/:fileId`
- `GET /api/files/analytics`
- `POST /api/replicas/replicate`
- `GET /api/replicas/replica-status/:fileId`
- `GET /api/replicas/replica-health`
- `POST /api/replicas/recover/:fileId`
- `POST /api/share/share-file`
- `GET /api/share/shared-files`
- `GET /api/share/shared/:token`
- `GET /api/share/download/:token`
- `PUT /api/share/permissions/:id`
- `DELETE /api/share/share/:id`
