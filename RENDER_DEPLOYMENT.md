# Render Deployment Guide

This project can be deployed with Render for both app services:

- `distributed-file-storage-api`: Node/Express backend as a Render Web Service
- `distributed-file-storage-web`: Vite/React frontend as a Render Static Site

The app still needs MySQL-compatible database hosting and Supabase Storage. Render's managed database product is PostgreSQL, while this codebase uses `mysql2`, so use an external MySQL provider unless you plan a database refactor.

## 1. Prepare Supabase Storage

Create these private buckets in Supabase:

- `chunks`
- `chunks_backup`

Copy your project URL and `service_role` key. Do not use the anon key for the backend.

## 2. Prepare MySQL

Create an empty MySQL database. The backend runs schema creation/migration on startup, so you do not need to manually import SQL for a fresh deploy.

Keep these values ready:

- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`

## 3. Deploy With Render Blueprint

1. Push this repository to GitHub.
2. In Render, choose **New > Blueprint**.
3. Select the repository and use the root-level `render.yaml`.
4. Render will create the backend Web Service and frontend Static Site.
5. Fill the `sync: false` secrets when Render prompts for them:
   - `DB_HOST`
   - `DB_PORT`
   - `DB_USER`
   - `DB_PASSWORD`
   - `DB_NAME`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

`JWT_SECRET` is generated automatically by Render.

## 4. Verify

After deploy completes:

1. Open the backend URL and check `/health`.
2. Open the frontend URL.
3. Sign up, upload a small file first, then test download and sharing.

If the frontend cannot reach the backend, check the frontend Static Site environment variable:

```text
VITE_API_URL=https://your-backend-service.onrender.com
```

The frontend code automatically appends `/api` when the value does not already end with `/api`.

If the backend rejects browser requests, check the backend Web Service environment variable:

```text
CLIENT_URL=https://your-frontend-site.onrender.com
```

For multiple allowed frontend origins, use a comma-separated value.

## Free Plan Memory Note

The backend service is configured with:

```text
MAX_UPLOAD_SIZE_BYTES=20971520
CHUNK_SIZE_BYTES=5242880
VITE_CHUNK_SIZE_BYTES=5242880
```

This keeps each multipart request below 20 MB while the frontend uploads files as 5 MB chunks. Avoid raising `MAX_UPLOAD_SIZE_BYTES` to hundreds of megabytes on Render's free plan, because the backend uses in-memory multipart parsing and the instance can exceed its memory limit.
