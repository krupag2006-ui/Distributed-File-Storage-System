const { requireSupabaseConfig, supabase, supabasePrimaryBucket, supabaseReplicaBuckets } = require('../config/supabase');

const normalizeDownloadedData = async (data) => {
  if (Buffer.isBuffer(data)) {
    return data;
  }

  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
};

const uploadChunkToCloud = async (chunkBuffer, chunkName) => {
  requireSupabaseConfig();

  const { data, error } = await supabase.storage
    .from(supabasePrimaryBucket)
    .upload(chunkName, chunkBuffer, {
      contentType: 'application/octet-stream',
      upsert: true
    });

  if (error) {
    throw new Error(`Supabase chunk upload failed: ${error.message}`);
  }

  const primaryPath = data.path;
  const replicaPaths = [];

  for (const bucket of supabaseReplicaBuckets) {
    const { data: replicaData, error: replicaError } = await supabase.storage
      .from(bucket)
      .upload(chunkName, chunkBuffer, {
        contentType: 'application/octet-stream',
        upsert: true
      });

    if (replicaError) {
      console.warn(`Replica upload failed for bucket ${bucket}:`, replicaError.message);
      continue;
    }

    replicaPaths.push({ bucket, path: replicaData.path });
  }

  return {
    primaryPath,
    replicaPaths
  };
};

const downloadChunkFromBucket = async (bucket, chunkPath) => {
  const { data, error } = await supabase.storage.from(bucket).download(chunkPath);

  if (error) {
    throw new Error(error.message || `Download failed from ${bucket}`);
  }

  return normalizeDownloadedData(data);
};

const restorePrimaryChunk = async (chunkPath, chunkBuffer) => {
  const { error } = await supabase.storage.from(supabasePrimaryBucket).upload(chunkPath, chunkBuffer, {
    contentType: 'application/octet-stream',
    upsert: true
  });

  if (error) {
    console.warn('Failed to restore primary chunk:', error.message);
  }
};

const downloadChunkFromCloud = async (chunkPath) => {
  requireSupabaseConfig();

  try {
    return await downloadChunkFromBucket(supabasePrimaryBucket, chunkPath);
  } catch (primaryError) {
    for (const bucket of supabaseReplicaBuckets) {
      try {
        const chunkBuffer = await downloadChunkFromBucket(bucket, chunkPath);
        await restorePrimaryChunk(chunkPath, chunkBuffer);
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

  const replicaPaths = [];

  for (const bucket of supabaseReplicaBuckets) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(chunkName, chunkBuffer, {
        contentType: 'application/octet-stream',
        upsert: true
      });

    if (error) {
      console.warn(`Replica upload failed for bucket ${bucket}:`, error.message);
      continue;
    }

    replicaPaths.push({ bucket, path: data.path });
  }

  return replicaPaths;
};

const replicateChunkToBackup = async (chunkBuffer, chunkName, bucket) => {
  requireSupabaseConfig();

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(chunkName, chunkBuffer, {
      contentType: 'application/octet-stream',
      upsert: true
    });

  if (error) {
    throw new Error(`Replica upload failed for bucket ${bucket}: ${error.message}`);
  }

  return data.path;
};

const deleteChunksFromCloud = async (chunkPaths) => {
  if (!chunkPaths.length) return;

  requireSupabaseConfig();

  const buckets = [supabasePrimaryBucket, ...supabaseReplicaBuckets];

  for (const bucket of buckets) {
    const { error } = await supabase.storage.from(bucket).remove(chunkPaths);
    if (error) {
      console.warn(`Failed to remove chunks from ${bucket}:`, error.message);
    }
  }
};

module.exports = {
  uploadChunkToCloud,
  downloadChunkFromBucket,
  downloadChunkFromCloud,
  replicateChunkToBackups,
  replicateChunkToBackup,
  restorePrimaryChunk,
  deleteChunksFromCloud
};
