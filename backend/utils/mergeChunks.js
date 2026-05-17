const { downloadChunkFromCloud } = require('./supabaseStorage');
const { calculateSha256 } = require('./fileHash');

const mergeChunks = async (chunks) => {
  const orderedChunks = [...chunks].sort((first, second) => first.chunk_index - second.chunk_index);

  const buffers = await Promise.all(
    orderedChunks.map(async (chunk, index) => {
      if (Number(chunk.chunk_index) !== index + 1) {
        throw new Error(`Missing chunk at index ${index + 1}.`);
      }

      const chunkBuffer = await downloadChunkFromCloud(chunk.chunk_path);

      if (chunk.chunk_hash && calculateSha256(chunkBuffer) !== chunk.chunk_hash) {
        throw new Error(`Chunk ${chunk.chunk_index} failed integrity validation.`);
      }

      return chunkBuffer;
    })
  );

  return Buffer.concat(buffers);
};

module.exports = mergeChunks;
