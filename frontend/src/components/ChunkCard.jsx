import {
  FaCube,
  FaDownload,
  FaEye,
  FaFileAlt,
  FaFileArchive,
  FaFileAudio,
  FaFileImage,
  FaFilePdf,
  FaFilePowerpoint,
  FaFileVideo,
  FaFileWord,
  FaSpinner
} from 'react-icons/fa';

const formatBytes = (bytes) => {
  const size = Number(bytes);
  if (!size) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const unitIndex = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  return `${(size / 1024 ** unitIndex).toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
};

const extensionOf = (fileName = '') => {
  const extension = fileName.toLowerCase().split('.').pop();
  return extension && extension !== fileName.toLowerCase() ? `.${extension}` : '';
};

const FileTypeIcon = ({ fileName = '', contentType = '' }) => {
  const extension = extensionOf(fileName);
  const normalizedType = contentType.toLowerCase();

  if (extension === '.pdf' || normalizedType.includes('pdf')) return <FaFilePdf />;
  if (['.doc', '.docx'].includes(extension) || normalizedType.includes('word')) return <FaFileWord />;
  if (['.ppt', '.pptx'].includes(extension) || normalizedType.includes('presentation')) return <FaFilePowerpoint />;
  if (normalizedType.startsWith('image/') || ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(extension)) return <FaFileImage />;
  if (normalizedType.startsWith('audio/') || ['.mp3', '.wav', '.m4a', '.aac'].includes(extension)) return <FaFileAudio />;
  if (normalizedType.startsWith('video/') || ['.mp4', '.mov', '.webm', '.avi'].includes(extension)) return <FaFileVideo />;
  if (extension === '.zip' || normalizedType.includes('zip')) return <FaFileArchive />;
  return <FaFileAlt />;
};

const downloadChunkIndex = (chunkIndex) => {
  const numericIndex = Number(chunkIndex);

  if (!Number.isInteger(numericIndex)) {
    return 0;
  }

  return numericIndex > 0 ? numericIndex - 1 : numericIndex;
};

const ChunkCard = ({
  chunk,
  isDownloading,
  isPreviewing,
  onDownload,
  onViewPreview,
  onLoadPreview,
  preview,
  isSelected
}) => {
  return (
    <article className={`rounded-md border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md ${
      isSelected ? 'border-teal-400 ring-2 ring-teal-100' : 'border-slate-200'
    }`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-950">
            <span className="shrink-0 text-teal-600">
              <FileTypeIcon fileName={chunk.file_name} contentType={chunk.contentType || chunk.mime_type} />
            </span>
            <span>chunk_{downloadChunkIndex(chunk.chunk_index)}</span>
          </div>
          <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
            <FaCube className="text-slate-400" />
            {formatBytes(chunk.chunk_size)}
          </p>
        </div>

        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => onViewPreview(chunk)}
            disabled={isPreviewing}
            className="grid h-9 w-9 place-items-center rounded-md bg-slate-100 text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={`View preview for chunk ${downloadChunkIndex(chunk.chunk_index)}`}
            title="View preview"
          >
            <FaEye className={isPreviewing ? 'animate-spin' : ''} />
          </button>

          <button
            type="button"
            onClick={() => onDownload(chunk)}
            disabled={isDownloading}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-slate-950 px-3 text-xs font-bold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            aria-label={`Download chunk ${downloadChunkIndex(chunk.chunk_index)}`}
            title="Download Chunk"
          >
            {isDownloading ? <FaSpinner className="animate-spin" /> : <FaDownload />}
            Download Chunk
          </button>
        </div>
      </div>

      {preview ? (
        <div className="mt-3 border-t border-slate-100 pt-3">
          {preview.hasReadableText && preview.text ? (
            <div>
              <p className="mb-2 text-xs font-semibold text-slate-600">
                Preview ready {preview.truncated ? '(truncated)' : ''}
              </p>
              <div className="rounded-md bg-slate-50 p-2 text-xs text-slate-700">
                <p className="line-clamp-3 whitespace-pre-wrap break-words">{preview.text}</p>
              </div>
            </div>
          ) : (
            <div className="rounded-md bg-slate-50 p-3 text-xs leading-5 text-slate-600">
              <p>{preview.message || 'No readable preview is available for this binary chunk.'}</p>
              <dl className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <dt className="font-semibold text-slate-500">Chunk ID</dt>
                  <dd className="font-mono text-slate-800">{chunk.id}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-slate-500">Type</dt>
                  <dd className="truncate text-slate-800">{chunk.contentType || chunk.mime_type || 'Binary'}</dd>
                </div>
              </dl>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={() => onLoadPreview(chunk)}
            disabled={isPreviewing}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPreviewing ? <FaSpinner className="animate-spin" /> : <FaFileAlt />}
            Load Preview
          </button>
        </div>
      )}
    </article>
  );
};

export default ChunkCard;
