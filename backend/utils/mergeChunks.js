const { downloadChunkFromCloud } = require('./supabaseStorage');
const { calculateSha256 } = require('./fileHash');

const expectedChunkStart = (orderedChunks) =>
  Number(orderedChunks[0]?.chunk_index) === 0 ? 0 : 1;

const mergeChunks = async (chunks) => {
  const orderedChunks = [...chunks].sort((first, second) => first.chunk_index - second.chunk_index);
  const expectedStart = expectedChunkStart(orderedChunks);

  const buffers = await Promise.all(
    orderedChunks.map(async (chunk, index) => {
      const expectedIndex = expectedStart + index;

      if (Number(chunk.chunk_index) !== expectedIndex) {
        throw new Error(`Missing chunk at index ${expectedIndex}.`);
      }

      const chunkBuffer = await downloadChunkFromCloud(chunk.chunk_path, {
        bucket: chunk.storage_bucket,
        chunkIndex: chunk.chunk_index,
        fileId: chunk.file_id,
        replicaSources: chunk.replicaSources || chunk.replicas
      });

      if (chunk.chunk_hash && calculateSha256(chunkBuffer) !== chunk.chunk_hash) {
        throw new Error(`Chunk ${chunk.chunk_index} failed integrity validation.`);
      }

      return chunkBuffer;
    })
  );

  return Buffer.concat(buffers);
};

module.exports = mergeChunks;
