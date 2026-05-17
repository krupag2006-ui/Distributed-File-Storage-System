import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FaCubes, FaDownload, FaFileAlt, FaLink, FaSearch, FaSpinner, FaTimes, FaTrash } from 'react-icons/fa';
import Navbar from '../components/Navbar';
import ShareModal from '../components/ShareModal';
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
  const [downloadingTextChunkId, setDownloadingTextChunkId] = useState(null);
  const [previewingChunkId, setPreviewingChunkId] = useState(null);
  const [chunkTextPreviews, setChunkTextPreviews] = useState({});
  const [downloadProgress, setDownloadProgress] = useState(0);

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

      const blob = response.data instanceof Blob ? response.data : new Blob([response.data], {
        type: response.headers['content-type'] || 'application/octet-stream'
      });
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
    setError('');
    setMessage('');

    try {
      const response = await api.get(`/files/${file.id}/chunks`);
      setChunks(response.data.chunks || []);
    } catch (fetchError) {
      setChunksError(fetchError.response?.data?.message || 'Unable to load chunks.');
    } finally {
      setChunksLoading(false);
    }
  };

  const closeChunksModal = () => {
    setSelectedFile(null);
    setChunks([]);
    setChunksError('');
    setDownloadingTextChunkId(null);
    setPreviewingChunkId(null);
    setChunkTextPreviews({});
  };

  const downloadChunkText = async (chunk) => {
    if (!selectedFile) return;

    setDownloadingTextChunkId(chunk.id);
    setChunksError('');

    try {
      const response = await api.get(`/chunks/${chunk.id}/text`, {
        responseType: 'blob'
      });

      downloadBlob(
        response.data,
        responseFileName(response, `${selectedFile.file_name}.chunk_${chunk.chunk_index}.txt`)
      );
    } catch (downloadError) {
      setChunksError(await downloadErrorMessage(downloadError, 'Readable chunk download failed.'));
    } finally {
      setDownloadingTextChunkId(null);
    }
  };

  const toggleChunkTextPreview = async (chunk) => {
    if (chunkTextPreviews[chunk.id]) {
      setChunkTextPreviews((current) => {
        const next = { ...current };
        delete next[chunk.id];
        return next;
      });
      return;
    }

    setPreviewingChunkId(chunk.id);
    setChunksError('');

    try {
      const response = await api.get(`/chunk-text/${chunk.id}`);
      setChunkTextPreviews((current) => ({
        ...current,
        [chunk.id]: response.data
      }));
    } catch (previewError) {
      setChunksError(previewError.response?.data?.message || 'Unable to load chunk text.');
    } finally {
      setPreviewingChunkId(null);
    }
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
                        <td className="max-w-xs truncate px-4 py-4 font-semibold text-slate-900">
                          {file.file_name}
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
                              aria-label={`Download ${file.file_name}`}
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
              className="max-h-[88vh] w-full max-w-5xl overflow-hidden rounded-md bg-white shadow-2xl shadow-slate-950/30"
            >
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
                <div className="min-w-0">
                  <h3 id="chunk-modal-title" className="text-xl font-bold text-slate-950">
                    Stored Chunks
                  </h3>
                  <p className="mt-1 truncate text-sm text-slate-600">
                    {selectedFile.file_name} - readable previews are extracted from text files and ZIP source files
                  </p>
                </div>
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

              <div className="max-h-[68vh] overflow-y-auto p-6">
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
                  <motion.div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {chunks.map((chunk, index) => (
                      <motion.article
                        key={chunk.id}
                        custom={index}
                        variants={chunkCardVariants}
                        initial="hidden"
                        animate="visible"
                        className="rounded-md border border-slate-200 bg-slate-50 p-4 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-bold text-slate-950">Chunk {chunk.chunk_index}</p>
                            <p className="mt-2 text-sm text-slate-600">
                              Size: {formatBytes(chunk.chunk_size)}
                            </p>
                          </div>

                          <div className="flex flex-col gap-2">
                            <button
                              type="button"
                              onClick={() => downloadChunkText(chunk)}
                              disabled={downloadingTextChunkId === chunk.id}
                              className="inline-flex items-center justify-center gap-2 rounded-md bg-indigo-700 px-3 py-2 text-sm font-bold text-white transition hover:bg-indigo-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                            >
                              {downloadingTextChunkId === chunk.id ? (
                                <FaSpinner className="animate-spin" />
                              ) : (
                                <FaFileAlt />
                              )}
                              Download Text
                            </button>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleChunkTextPreview(chunk)}
                          disabled={previewingChunkId === chunk.id}
                          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md border border-indigo-200 bg-white px-3 py-2 text-sm font-bold text-indigo-700 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:text-slate-400"
                        >
                          {previewingChunkId === chunk.id ? (
                            <FaSpinner className="animate-spin" />
                          ) : (
                            <FaFileAlt />
                          )}
                          {chunkTextPreviews[chunk.id] ? 'Hide Preview' : 'Preview Text'}
                        </button>
                        {chunkTextPreviews[chunk.id] && (
                          <div className="mt-3 rounded-md border border-slate-200 bg-white">
                            <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 text-xs font-bold uppercase text-slate-500">
                              <span>
                                {chunkTextPreviews[chunk.id].mode === 'zip-text'
                                  ? 'extracted zip text'
                                  : 'text preview'}
                              </span>
                              {chunkTextPreviews[chunk.id].truncated && <span>truncated</span>}
                            </div>
                            {chunkTextPreviews[chunk.id].sourceFiles?.length > 0 && (
                              <div className="border-b border-slate-200 px-3 py-2 text-xs text-slate-500">
                                {chunkTextPreviews[chunk.id].sourceFiles.slice(0, 3).join(', ')}
                                {chunkTextPreviews[chunk.id].sourceFiles.length > 3 && '...'}
                              </div>
                            )}
                            <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words bg-slate-950 p-3 text-xs leading-5 text-slate-100">
                              {highlightedPreview(chunkTextPreviews[chunk.id].text)}
                            </pre>
                          </div>
                        )}
                      </motion.article>
                    ))}
                  </motion.div>
                )}
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
