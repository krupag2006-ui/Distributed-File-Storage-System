import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  FaCubes,
  FaDownload,
  FaFileAlt,
  FaFileArchive,
  FaFileAudio,
  FaFileImage,
  FaFilePdf,
  FaFilePowerpoint,
  FaFileVideo,
  FaFileWord,
  FaLink,
  FaSearch,
  FaSpinner,
  FaTimes,
  FaTrash
} from 'react-icons/fa';
import Navbar from '../components/Navbar';
import ShareModal from '../components/ShareModal';
import ChunkCard from '../components/ChunkCard';
import api from '../services/api';

const formatBytes = (bytes) => {
  const size = Number(bytes);
  if (!size) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const unitIndex = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  return `${(size / 1024 ** unitIndex).toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
};

const formatDate = (date) =>
  new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(date));

const downloadBlob = (blob, fileName) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

const fileNameFromDisposition = (contentDisposition) => {
  if (!contentDisposition) return '';

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].replace(/"/g, ''));
    } catch (error) {
      return utf8Match[1].replace(/"/g, '');
    }
  }

  const fileNameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  return fileNameMatch?.[1] || '';
};

const responseFileName = (response, fallback) =>
  fileNameFromDisposition(response.headers?.['content-disposition']) || fallback;

const extensionOf = (fileName = '') => {
  const extension = fileName.toLowerCase().split('.').pop();
  return extension && extension !== fileName.toLowerCase() ? `.${extension}` : '';
};

const downloadChunkIndex = (chunkIndex) => {
  const numericIndex = Number(chunkIndex);

  if (!Number.isInteger(numericIndex)) {
    return 0;
  }

  return numericIndex > 0 ? numericIndex - 1 : numericIndex;
};

const FileTypeIcon = ({ file }) => {
  const extension = extensionOf(file.file_name || file.fileName);
  const contentType = String(file.content_type || file.contentType || '').toLowerCase();

  if (extension === '.pdf' || contentType.includes('pdf')) return <FaFilePdf />;
  if (['.doc', '.docx'].includes(extension) || contentType.includes('word')) return <FaFileWord />;
  if (['.ppt', '.pptx'].includes(extension) || contentType.includes('presentation')) return <FaFilePowerpoint />;
  if (contentType.startsWith('image/') || ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(extension)) return <FaFileImage />;
  if (contentType.startsWith('audio/') || ['.mp3', '.wav', '.m4a', '.aac'].includes(extension)) return <FaFileAudio />;
  if (contentType.startsWith('video/') || ['.mp4', '.mov', '.webm', '.avi'].includes(extension)) return <FaFileVideo />;
  if (extension === '.zip' || contentType.includes('zip')) return <FaFileArchive />;
  return <FaFileAlt />;
};

const messageFromText = (text, fallback) => {
  if (!text) return fallback;

  try {
    return JSON.parse(text).message || fallback;
  } catch (error) {
    return text || fallback;
  }
};

const downloadErrorMessage = async (downloadError, fallback) => {
  const data = downloadError.response?.data;

  if (data?.message) {
    return data.message;
  }

  if (data instanceof Blob) {
    return messageFromText(await data.text(), fallback);
  }

  if (data instanceof ArrayBuffer) {
    return messageFromText(new TextDecoder().decode(data), fallback);
  }

  if (typeof data === 'string') {
    return messageFromText(data, fallback);
  }

  return fallback;
};

const CODE_KEYWORDS = new Set([
  'abstract',
  'async',
  'await',
  'boolean',
  'break',
  'catch',
  'class',
  'const',
  'def',
  'else',
  'extends',
  'final',
  'for',
  'from',
  'function',
  'if',
  'import',
  'int',
  'let',
  'new',
  'private',
  'protected',
  'public',
  'return',
  'static',
  'string',
  'try',
  'var',
  'void',
  'while'
]);

const highlightTokenPattern =
  /(\/\/.*|#.*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b[A-Za-z_][A-Za-z0-9_]*\b|\d+(?:\.\d+)?)/g;

const highlightedPreview = (text) =>
  text.split(highlightTokenPattern).map((token, index) => {
    if (!token) return null;

    let className = '';
    const lowerToken = token.toLowerCase();

    if (token.startsWith('//') || token.startsWith('#')) {
      className = 'text-slate-500';
    } else if (token.startsWith('"') || token.startsWith("'")) {
      className = 'text-emerald-700';
    } else if (CODE_KEYWORDS.has(lowerToken)) {
      className = 'font-semibold text-indigo-700';
    } else if (/^\d/.test(token)) {
      className = 'text-amber-700';
    }

    return className ? (
      <span key={`${token}-${index}`} className={className}>
        {token}
      </span>
    ) : (
      token
    );
  });

const modalVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 }
};

const panelVariants = {
  hidden: { opacity: 0, scale: 0.96, y: 18 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 210, damping: 22 }
  },
  exit: { opacity: 0, scale: 0.96, y: 18 }
};

const chunkCardVariants = {
  hidden: { opacity: 0, y: 16, scale: 0.94 },
  visible: (index) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      delay: index * 0.045,
      type: 'spring',
      stiffness: 190,
      damping: 18
    }
  })
};

const MyFiles = () => {
  const [files, setFiles] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [downloadingFileId, setDownloadingFileId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [shareFile, setShareFile] = useState(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [chunks, setChunks] = useState([]);
  const [chunksLoading, setChunksLoading] = useState(false);
  const [chunksError, setChunksError] = useState('');
  const [downloadingChunkId, setDownloadingChunkId] = useState(null);
  const [downloadingPreviewTextChunkId, setDownloadingPreviewTextChunkId] = useState(null);
  const [previewingChunkId, setPreviewingChunkId] = useState(null);
  const [chunkPreviews, setChunkPreviews] = useState({}); // Maps chunk.id to preview data
  const [selectedPreviewChunkId, setSelectedPreviewChunkId] = useState(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [selectedChunkMetadata, setSelectedChunkMetadata] = useState(null);

  const fetchFiles = async (currentSearch = search) => {
    setLoading(true);
    setError('');

    try {
      const response = await api.get('/files', { params: { search: currentSearch } });
      setFiles(response.data.files || []);
    } catch (fetchError) {
      setError(fetchError.response?.data?.message || 'Unable to load files.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchFiles(search);
    }, 250);

    return () => clearTimeout(timer);
  }, [search]);

  const openShareModal = (file) => {
    setShareFile(file);
    setShareModalOpen(true);
    setError('');
    setMessage('');
  };

  const closeShareModal = () => {
    setShareFile(null);
    setShareModalOpen(false);
  };

  const onShareCreated = () => {
    setMessage('Share link created successfully.');
  };

  const downloadFile = async (file) => {
    setDownloadingFileId(file.id);
    setDownloadProgress(0);
    setError('');
    setMessage('');

    try {
      const response = await api.get(`/files/${file.id}/download`, {
        responseType: 'blob',
        onDownloadProgress: (event) => {
          if (event.total) {
            setDownloadProgress(Math.round((event.loaded / event.total) * 100));
          }
        }
      });

      const contentType = response.headers['content-type'] || response.data?.type || 'application/octet-stream';
      const blob = new Blob([response.data], { type: contentType });
      downloadBlob(blob, responseFileName(response, file.file_name));
      setMessage(`${file.file_name} downloaded successfully.`);
    } catch (downloadError) {
      setError(await downloadErrorMessage(downloadError, 'Download failed.'));
    } finally {
      setDownloadingFileId(null);
      setDownloadProgress(0);
    }
  };

  const openChunksModal = async (file) => {
    setSelectedFile(file);
    setChunks([]);
    setChunksError('');
    setChunksLoading(true);
    setSelectedPreviewChunkId(null);
    setError('');
    setMessage('');

    try {
      const response = await api.get(`/files/${file.id}/chunks`);
      const loadedChunks = (response.data.chunks || []).map((chunk) => ({
        ...chunk,
        file_name: chunk.file_name || file.file_name,
        file_size: chunk.file_size || file.file_size,
        chunk_count: chunk.chunk_count || file.chunk_count,
        contentType: chunk.contentType || file.content_type
      }));
      const previews = loadedChunks.reduce((current, chunk) => {
        if (chunk.preview) {
          current[chunk.id] = chunk.preview;
        }
        return current;
      }, {});

      setChunks(loadedChunks);
      setChunkPreviews(previews);
      setSelectedPreviewChunkId(loadedChunks[0]?.id || null);
    } catch (fetchError) {
      setChunksError(await downloadErrorMessage(fetchError, 'Unable to load chunks.'));
    } finally {
      setChunksLoading(false);
    }
  };

  const closeChunksModal = () => {
    setSelectedFile(null);
    setChunks([]);
    setChunksError('');
    setDownloadingChunkId(null);
    setDownloadingPreviewTextChunkId(null);
    setPreviewingChunkId(null);
    setChunkPreviews({});
    setSelectedPreviewChunkId(null);
    setSelectedChunkMetadata(null);
  };

  const downloadChunk = async (chunk) => {
    if (!selectedFile) return;

    setDownloadingChunkId(chunk.id);
    setChunksError('');

    try {
      const response = await api.get(`/chunks/${chunk.id}/download`, {
        responseType: 'blob'
      });

      const contentType = response.headers['content-type'] || 'application/octet-stream';
      const blob = new Blob([response.data], { type: contentType });

      downloadBlob(blob, responseFileName(response, `chunk_${downloadChunkIndex(chunk.chunk_index)}.bin`));
      setMessage(`Chunk ${downloadChunkIndex(chunk.chunk_index)} downloaded successfully.`);
    } catch (downloadError) {
      setChunksError(await downloadErrorMessage(downloadError, 'Chunk download failed.'));
    } finally {
      setDownloadingChunkId(null);
    }
  };

  const downloadChunkPreviewText = async (chunk) => {
    if (!selectedFile) return;

    setDownloadingPreviewTextChunkId(chunk.id);
    setChunksError('');

    try {
      const response = await api.get(`/chunks/${chunk.id}/text`, {
        responseType: 'blob'
      });

      const blob = new Blob([response.data], { type: response.headers['content-type'] || 'text/plain' });
      downloadBlob(blob, responseFileName(response, `chunk_${downloadChunkIndex(chunk.chunk_index)}.txt`));
      setMessage(`Chunk ${downloadChunkIndex(chunk.chunk_index)} preview text downloaded successfully.`);
    } catch (downloadError) {
      setChunksError(await downloadErrorMessage(downloadError, 'Preview text download failed.'));
    } finally {
      setDownloadingPreviewTextChunkId(null);
    }
  };

  const loadChunkPreview = async (chunk) => {
    if (chunkPreviews[chunk.id]) {
      setSelectedPreviewChunkId(chunk.id);
      return;
    }

    setSelectedPreviewChunkId(chunk.id);
    setPreviewingChunkId(chunk.id);
    setChunksError('');

    try {
      const response = await api.get(`/chunk-text/${chunk.id}`);
      setChunkPreviews((current) => ({
        ...current,
        [chunk.id]: response.data
      }));
    } catch (previewError) {
      setChunksError(await downloadErrorMessage(previewError, 'Unable to load chunk preview.'));
    } finally {
      setPreviewingChunkId(null);
    }
  };

  const viewChunkPreview = (chunk) => {
    loadChunkPreview(chunk);
  };

  const deleteFile = async (file) => {
    const confirmed = window.confirm(`Delete ${file.file_name}?`);
    if (!confirmed) return;

    setDeletingId(file.id);
    setError('');
    setMessage('');

    try {
      await api.delete(`/files/${file.id}`);
      setMessage(`${file.file_name} deleted successfully.`);
      fetchFiles();
    } catch (deleteError) {
      setError(deleteError.response?.data?.message || 'Delete failed.');
    } finally {
      setDeletingId(null);
    }
  };

  const selectedPreviewChunk = chunks.find((chunk) => chunk.id === selectedPreviewChunkId);
  const selectedPreview = selectedPreviewChunk ? chunkPreviews[selectedPreviewChunk.id] : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-100">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <section className="rounded-md border border-white/70 bg-white/85 p-6 shadow-xl shadow-indigo-950/10 backdrop-blur">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-slate-950">My Files</h2>
              <p className="mt-2 text-sm text-slate-600">Search uploaded files and download them.</p>
            </div>

            <label className="flex w-full items-center gap-3 rounded-md border border-indigo-100 bg-indigo-50 px-4 py-3 text-slate-700 md:max-w-sm">
              <FaSearch className="text-indigo-600" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full bg-transparent outline-none"
                placeholder="Search by file name"
              />
            </label>
          </div>

          {message && (
            <div className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
              {message}
            </div>
          )}

          {error && (
            <div className="mt-6 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
              {error}
            </div>
          )}

          <div className="mt-6 overflow-hidden rounded-md border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wider text-slate-600">
                      File Name
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wider text-slate-600">
                      File Size
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wider text-slate-600">
                      Upload Date
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wider text-slate-600">
                      Chunk Count
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wider text-slate-600">
                      View Chunks
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wider text-slate-600">
                      Download Full File
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wider text-slate-600">
                      Share
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wider text-slate-600">
                      Delete
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan="8" className="px-4 py-12 text-center text-slate-500">
                        <FaSpinner className="mx-auto mb-3 animate-spin text-2xl text-indigo-600" />
                        Loading files...
                      </td>
                    </tr>
                  ) : files.length ? (
                    files.map((file) => (
                      <tr key={file.id} className="transition hover:bg-indigo-50/60">
                        <td className="max-w-xs px-4 py-4 font-semibold text-slate-900">
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="shrink-0 text-lg text-indigo-600">
                              <FileTypeIcon file={file} />
                            </span>
                            <span className="truncate">{file.file_name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-slate-600">{formatBytes(file.file_size)}</td>
                        <td className="px-4 py-4 text-slate-600">{formatDate(file.upload_date)}</td>
                        <td className="px-4 py-4 text-slate-600">{file.chunk_count}</td>
                        <td className="px-4 py-4">
                          <button
                            type="button"
                            onClick={() => openChunksModal(file)}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-teal-600 text-white transition hover:bg-teal-700"
                            aria-label={`View chunks for ${file.file_name}`}
                            title="View Chunks"
                          >
                            <FaCubes />
                          </button>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex min-w-28 flex-col gap-2">
                            <button
                              type="button"
                              onClick={() => downloadFile(file)}
                              disabled={downloadingFileId === file.id}
                              className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-indigo-600 text-white transition hover:bg-indigo-700 disabled:bg-slate-400"
                              aria-label={`Download full file ${file.file_name}`}
                              title="Download Full File"
                            >
                              {downloadingFileId === file.id ? (
                                <FaSpinner className="animate-spin" />
                              ) : (
                                <FaDownload />
                              )}
                            </button>
                            {downloadingFileId === file.id && (
                              <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-200">
                                <div
                                  className="h-full bg-indigo-600 transition-all"
                                  style={{ width: `${downloadProgress || 8}%` }}
                                />
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <button
                            type="button"
                            onClick={() => openShareModal(file)}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-emerald-600 text-white transition hover:bg-emerald-700"
                            aria-label={`Share ${file.file_name}`}
                            title="Share"
                          >
                            <FaLink />
                          </button>
                        </td>
                        <td className="px-4 py-4">
                          <button
                            type="button"
                            onClick={() => deleteFile(file)}
                            disabled={deletingId === file.id}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-rose-600 text-white transition hover:bg-rose-700 disabled:bg-slate-400"
                            aria-label={`Delete ${file.file_name}`}
                            title="Delete"
                          >
                            {deletingId === file.id ? (
                              <FaSpinner className="animate-spin" />
                            ) : (
                              <FaTrash />
                            )}
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="8" className="px-4 py-12 text-center text-slate-500">
                        No files found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>

      <AnimatePresence>
        {selectedFile && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-6 backdrop-blur-sm"
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-labelledby="chunk-modal-title"
              variants={panelVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-md bg-white shadow-2xl shadow-slate-950/30"
            >
              <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
                <div className="min-w-0">
                  <h3 id="chunk-modal-title" className="text-xl font-bold text-slate-950">
                    Stored Chunks
                  </h3>
                  <p className="mt-1 truncate text-sm text-slate-600">
                    {selectedFile.file_name}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => downloadFile(selectedFile)}
                  disabled={downloadingFileId === selectedFile.id}
                  className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-indigo-600 px-3 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                  title="Download Full File"
                >
                  {downloadingFileId === selectedFile.id ? <FaSpinner className="animate-spin" /> : <FaDownload />}
                  <span className="hidden sm:inline">Download Full File</span>
                </button>
                <button
                  type="button"
                  onClick={closeChunksModal}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-slate-100 text-slate-700 transition hover:bg-slate-200"
                  aria-label="Close chunks modal"
                  title="Close"
                >
                  <FaTimes />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-6">
                {chunksLoading && (
                  <div className="py-12 text-center text-slate-500">
                    <FaSpinner className="mx-auto mb-3 animate-spin text-2xl text-indigo-600" />
                    Loading chunks...
                  </div>
                )}

                {chunksError && (
                  <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                    {chunksError}
                  </div>
                )}

                {!chunksLoading && !chunksError && (
                  <>
                    <motion.div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {chunks.map((chunk, index) => (
                        <motion.div
                          key={chunk.id}
                          custom={index}
                          variants={chunkCardVariants}
                          initial="hidden"
                          animate="visible"
                        >
                          <ChunkCard
                            chunk={chunk}
                            isDownloading={downloadingChunkId === chunk.id}
                            isPreviewing={previewingChunkId === chunk.id}
                            onDownload={downloadChunk}
                            onViewPreview={viewChunkPreview}
                            onLoadPreview={loadChunkPreview}
                            preview={chunkPreviews[chunk.id]}
                            isSelected={selectedPreviewChunkId === chunk.id}
                          />
                        </motion.div>
                      ))}
                    </motion.div>

                    <section className="mt-5 rounded-md border border-slate-200 bg-white">
                      <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h4 className="font-bold text-slate-950">Preview Text</h4>
                          <p className="text-sm text-slate-500">
                            {selectedPreviewChunk
                              ? `chunk_${downloadChunkIndex(selectedPreviewChunk.chunk_index)}`
                              : 'Select a chunk to view extracted text'}
                          </p>
                        </div>
                        {selectedPreview?.truncated && (
                          <span className="text-xs font-semibold text-amber-700">Truncated</span>
                        )}
                        {selectedPreview?.hasReadableText && selectedPreview.text && selectedPreviewChunk && (
                          <button
                            type="button"
                            onClick={() => downloadChunkPreviewText(selectedPreviewChunk)}
                            disabled={downloadingPreviewTextChunkId === selectedPreviewChunk.id}
                            className="inline-flex items-center justify-center gap-2 rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-bold text-teal-800 transition hover:border-teal-300 hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {downloadingPreviewTextChunkId === selectedPreviewChunk.id ? (
                              <FaSpinner className="animate-spin" />
                            ) : (
                              <FaFileAlt />
                            )}
                            Download Preview Text
                          </button>
                        )}
                      </div>

                      <div className="p-4">
                        {!selectedPreviewChunk ? (
                          <p className="text-sm text-slate-500">No chunk selected.</p>
                        ) : previewingChunkId === selectedPreviewChunk.id && !selectedPreview ? (
                          <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                            <FaSpinner className="animate-spin text-indigo-600" />
                            Loading preview...
                          </div>
                        ) : selectedPreview?.hasReadableText && selectedPreview.text ? (
                          <pre className="max-h-[32vh] overflow-y-auto whitespace-pre-wrap rounded-md bg-slate-50 p-4 text-sm leading-6 text-slate-800">
                            {selectedPreview.text}
                          </pre>
                        ) : (
                          <div className="rounded-md bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                            <p>
                              {selectedPreview?.message ||
                                'No readable preview is available for this chunk.'}
                            </p>
                            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                              <div>
                                <dt className="text-xs font-bold uppercase text-slate-500">Chunk ID</dt>
                                <dd className="font-mono text-slate-900">{selectedPreviewChunk.id}</dd>
                              </div>
                              <div>
                                <dt className="text-xs font-bold uppercase text-slate-500">Size</dt>
                                <dd className="text-slate-900">{formatBytes(selectedPreviewChunk.chunk_size)}</dd>
                              </div>
                              <div className="sm:col-span-2">
                                <dt className="text-xs font-bold uppercase text-slate-500">Content Type</dt>
                                <dd className="break-all text-slate-900">
                                  {selectedPreviewChunk.contentType ||
                                    selectedPreviewChunk.mime_type ||
                                    'application/octet-stream'}
                                </dd>
                              </div>
                            </dl>
                          </div>
                        )}
                      </div>
                    </section>
                  </>
                )}
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedChunkMetadata && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-6 backdrop-blur-sm"
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-labelledby="metadata-modal-title"
              variants={panelVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="w-full max-w-md overflow-hidden rounded-md bg-white shadow-2xl shadow-slate-950/30"
            >
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
                <div className="min-w-0">
                  <h3 id="metadata-modal-title" className="text-xl font-bold text-slate-950">
                    Chunk Metadata
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedChunkMetadata(null)}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-slate-100 text-slate-700 transition hover:bg-slate-200"
                  aria-label="Close metadata modal"
                  title="Close"
                >
                  <FaTimes />
                </button>
              </div>

              <div className="p-6">
                <dl className="space-y-4">
                  <div>
                    <dt className="text-sm font-semibold text-slate-600">Chunk ID</dt>
                    <dd className="mt-1 font-mono text-sm text-slate-900">
                      {selectedChunkMetadata.id || selectedChunkMetadata.chunkId || selectedChunkMetadata.chunk_id}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-semibold text-slate-600">File Name</dt>
                    <dd className="mt-1 truncate text-sm text-slate-900">
                      {selectedChunkMetadata.file_name || selectedChunkMetadata.fileName}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-semibold text-slate-600">Chunk Index</dt>
                    <dd className="mt-1 text-sm text-slate-900">
                      {selectedChunkMetadata.chunk_index || selectedChunkMetadata.chunkIndex}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-semibold text-slate-600">Chunk Size</dt>
                    <dd className="mt-1 text-sm text-slate-900">
                      {formatBytes(selectedChunkMetadata.chunk_size || selectedChunkMetadata.chunkSize)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-semibold text-slate-600">Content Type</dt>
                    <dd className="mt-1 break-all text-sm text-slate-900">
                      {selectedChunkMetadata.contentType || selectedChunkMetadata.mime_type || 'application/octet-stream'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-semibold text-slate-600">Total Chunks</dt>
                    <dd className="mt-1 text-sm text-slate-900">{selectedChunkMetadata.chunk_count || selectedChunkMetadata.totalChunks || 'N/A'}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-semibold text-slate-600">Hash</dt>
                    <dd className="mt-1 break-all font-mono text-xs text-slate-700">
                      {selectedChunkMetadata.chunk_hash || selectedChunkMetadata.chunkHash}
                    </dd>
                  </div>
                </dl>
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>

      <ShareModal
        file={shareFile}
        isOpen={shareModalOpen}
        onClose={closeShareModal}
        onShareCreated={onShareCreated}
      />
    </div>
  );
};

export default MyFiles;
