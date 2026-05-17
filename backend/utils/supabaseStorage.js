const { requireSupabaseConfig, supabase, supabasePrimaryBucket, supabaseReplicaBuckets } = require('../config/supabase');

const cleanPathInput = (pathValue) =>
  String(pathValue || '')
    .trim()
    .replace(/\\/g, '/')
    .split('?')[0]
    .replace(/^\/+/, '');

const configuredBuckets = () =>
  [supabasePrimaryBucket, ...supabaseReplicaBuckets].filter(Boolean);

const uniqueValues = (values) => [...new Set(values.filter(Boolean))];

const extractObjectPathFromStorageUrl = (pathValue) => {
  const marker = '/storage/v1/object/';
  const markerIndex = pathValue.indexOf(marker);

  if (markerIndex === -1) {
    return pathValue;
  }

  const afterMarker = pathValue.slice(markerIndex + marker.length);
  const parts = afterMarker.split('/').filter(Boolean);

  if (parts.length < 3) {
    return pathValue;
  }

  return parts.slice(2).join('/');
};

const stripBucketPrefix = (pathValue, preferredBucket) => {
  const buckets = uniqueValues([preferredBucket, ...configuredBuckets()]);

  for (const bucket of buckets) {
    if (pathValue === bucket) {
      return '';
    }

    if (pathValue.startsWith(`${bucket}/`)) {
      return pathValue.slice(bucket.length + 1);
    }
  }

  return pathValue;
};

const normalizeStoragePath = (pathValue, bucket = supabasePrimaryBucket) => {
  const cleanedPath = cleanPathInput(pathValue);
  const objectPath = extractObjectPathFromStorageUrl(cleanedPath);
  return stripBucketPrefix(objectPath.replace(/^\/+/, ''), bucket);
};

const chunkPathIndex = (chunkIndex) => {
  const numericIndex = Number(chunkIndex);

  if (!Number.isFinite(numericIndex)) {
    return 0;
  }

  return numericIndex > 0 ? numericIndex - 1 : numericIndex;
};

const buildChunkPath = (fileId, chunkIndex) => `uploads/${fileId}/chunk_${chunkPathIndex(chunkIndex)}`;

const buildLegacyChunkPath = (fileId, chunkIndex) => `files/${fileId}/file${fileId}_chunk_${chunkIndex}`;

const buildStoragePathCandidates = (chunkPath, options = {}) => {
  const rawPath = cleanPathInput(chunkPath);
  const normalizedPath = normalizeStoragePath(chunkPath, options.bucket);
  const candidates = [normalizedPath, rawPath];

  if (options.fileId !== undefined && options.chunkIndex !== undefined) {
    candidates.push(buildChunkPath(options.fileId, options.chunkIndex));
    candidates.push(`uploads/${options.fileId}/chunk_${options.chunkIndex}`);
    candidates.push(buildLegacyChunkPath(options.fileId, options.chunkIndex));
  }

  return uniqueValues([
    ...candidates.map((candidate) => normalizeStoragePath(candidate, options.bucket)),
    ...candidates.map(cleanPathInput)
  ]);
};

const normalizeDownloadedData = async (data) => {
  if (Buffer.isBuffer(data)) {
    return data;
  }

  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
};

const uploadChunkToCloud = async (chunkBuffer, chunkName) => {
  requireSupabaseConfig();

  const storagePath = normalizeStoragePath(chunkName, supabasePrimaryBucket);

  const { data, error } = await supabase.storage
    .from(supabasePrimaryBucket)
    .upload(storagePath, chunkBuffer, {
      contentType: 'application/octet-stream',
      upsert: true
    });

  if (error) {
    throw new Error(`Supabase chunk upload failed: ${error.message}`);
  }

  const primaryPath = normalizeStoragePath(data?.path || data?.fullPath || storagePath, supabasePrimaryBucket);
  const replicaPaths = [];

  for (const bucket of supabaseReplicaBuckets) {
    const { data: replicaData, error: replicaError } = await supabase.storage
      .from(bucket)
      .upload(primaryPath, chunkBuffer, {
        contentType: 'application/octet-stream',
        upsert: true
      });

    if (replicaError) {
      console.warn(`Replica upload failed for bucket ${bucket}:`, replicaError.message);
      continue;
    }

    replicaPaths.push({
      bucket,
      path: normalizeStoragePath(replicaData?.path || replicaData?.fullPath || primaryPath, bucket)
    });
  }

  return {
    primaryPath,
    replicaPaths
  };
};

const downloadExactChunkFromBucket = async (bucket, chunkPath) => {
  const { data, error } = await supabase.storage.from(bucket).download(chunkPath);

  if (error) {
    throw new Error(error.message || `Download failed from ${bucket}`);
  }

  return normalizeDownloadedData(data);
};

const downloadChunkFromBucketCandidates = async (bucket, candidates) => {
  let lastError = null;

  for (const candidate of candidates) {
    try {
      const buffer = await downloadExactChunkFromBucket(bucket, candidate);
      return { buffer, path: candidate, bucket };
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `Object not found in bucket "${bucket}" at path(s): ${candidates.join(', ')}. ${lastError?.message || ''}`.trim()
  );
};

const downloadChunkFromBucket = async (bucket, chunkPath, options = {}) => {
  const candidates = buildStoragePathCandidates(chunkPath, { ...options, bucket });
  const { buffer } = await downloadChunkFromBucketCandidates(bucket, candidates);
  return buffer;
};

const restorePrimaryChunk = async (chunkPath, chunkBuffer, bucket = supabasePrimaryBucket) => {
  const storagePath = normalizeStoragePath(chunkPath, bucket);
  const { error } = await supabase.storage.from(bucket).upload(storagePath, chunkBuffer, {
    contentType: 'application/octet-stream',
    upsert: true
  });

  if (error) {
    console.warn('Failed to restore primary chunk:', error.message);
  }
};

const downloadChunkFromCloud = async (chunkPath, options = {}) => {
  requireSupabaseConfig();

  const primaryBucket = options.bucket || options.primaryBucket || supabasePrimaryBucket;
  const primaryCandidates = buildStoragePathCandidates(chunkPath, {
    ...options,
    bucket: primaryBucket
  });

  try {
    const { buffer } = await downloadChunkFromBucketCandidates(primaryBucket, primaryCandidates);
    return buffer;
  } catch (primaryError) {
    const configuredReplicaSources = supabaseReplicaBuckets.map((bucket) => ({
      bucket,
      path: chunkPath
    }));
    const replicaSources = options.replicaSources?.length
      ? options.replicaSources
      : configuredReplicaSources;

    for (const replica of replicaSources) {
      const bucket = replica.bucket;
      const replicaCandidates = buildStoragePathCandidates(replica.path || chunkPath, {
        ...options,
        bucket
      });

      try {
        const { buffer: chunkBuffer } = await downloadChunkFromBucketCandidates(bucket, replicaCandidates);
        await restorePrimaryChunk(primaryCandidates[0] || chunkPath, chunkBuffer, primaryBucket);
        return chunkBuffer;
      } catch (replicaError) {
        console.warn(`Replica download failed from ${bucket}:`, replicaError.message);
      }
    }

    throw new Error(`Supabase chunk download failed: ${primaryError.message}`);
  }
};

const replicateChunkToBackups = async (chunkBuffer, chunkName) => {
  requireSupabaseConfig();

  const storagePath = normalizeStoragePath(chunkName, supabasePrimaryBucket);
  const replicaPaths = [];

  for (const bucket of supabaseReplicaBuckets) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(storagePath, chunkBuffer, {
        contentType: 'application/octet-stream',
        upsert: true
      });

    if (error) {
      console.warn(`Replica upload failed for bucket ${bucket}:`, error.message);
      continue;
    }

    replicaPaths.push({ bucket, path: normalizeStoragePath(data?.path || data?.fullPath || storagePath, bucket) });
  }

  return replicaPaths;
};

const replicateChunkToBackup = async (chunkBuffer, chunkName, bucket) => {
  requireSupabaseConfig();

  const storagePath = normalizeStoragePath(chunkName, bucket);
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(storagePath, chunkBuffer, {
      contentType: 'application/octet-stream',
      upsert: true
    });

  if (error) {
    throw new Error(`Replica upload failed for bucket ${bucket}: ${error.message}`);
  }

  return normalizeStoragePath(data?.path || data?.fullPath || storagePath, bucket);
};

const deleteChunksFromCloud = async (chunkPaths) => {
  if (!chunkPaths.length) return;

  requireSupabaseConfig();

  const buckets = [supabasePrimaryBucket, ...supabaseReplicaBuckets];
  const pathsToRemove = uniqueValues(
    chunkPaths.flatMap((chunkPath) => buildStoragePathCandidates(chunkPath))
  );

  for (const bucket of buckets) {
    const { error } = await supabase.storage.from(bucket).remove(pathsToRemove);
    if (error) {
      console.warn(`Failed to remove chunks from ${bucket}:`, error.message);
    }
  }
};

module.exports = {
  buildChunkPath,
  buildStoragePathCandidates,
  normalizeStoragePath,
  uploadChunkToCloud,
  downloadChunkFromBucket,
  downloadChunkFromCloud,
  replicateChunkToBackups,
  replicateChunkToBackup,
  restorePrimaryChunk,
  deleteChunksFromCloud
};
