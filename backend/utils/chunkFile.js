const { buildChunkPath, uploadChunkToCloud } = require('./supabaseStorage');
const { calculateSha256 } = require('./fileHash');

const TEN_MB = 10 * 1024 * 1024;
const DEFAULT_CHUNK_SIZE = Number(process.env.CHUNK_SIZE_BYTES || TEN_MB);

const chunkFile = async ({ fileId, fileBuffer, chunkSize = DEFAULT_CHUNK_SIZE }) => {
  const chunks = [];

  for (let offset = 0, chunkIndex = 1; offset < fileBuffer.length; offset += chunkSize, chunkIndex += 1) {
    const chunkBuffer = fileBuffer.subarray(offset, Math.min(offset + chunkSize, fileBuffer.length));
    const chunkName = buildChunkPath(fileId, chunkIndex);
    const chunkHash = calculateSha256(chunkBuffer);

    const { primaryPath, replicaPaths } = await uploadChunkToCloud(chunkBuffer, chunkName);

    chunks.push({
      chunkIndex,
      chunkPath: primaryPath,
      chunkSize: chunkBuffer.length,
      chunkHash,
      replicaPaths
    });
  }

  return chunks;
};

module.exports = {
  DEFAULT_CHUNK_SIZE,
  chunkFile
};
