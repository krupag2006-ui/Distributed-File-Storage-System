import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  FaCheckCircle,
  FaCloudUploadAlt,
  FaFileAlt,
  FaFolderOpen,
  FaSpinner,
  FaTimesCircle
} from 'react-icons/fa';
import api from '../services/api';

const chunkSizeBytes = Number(import.meta.env.VITE_CHUNK_SIZE_BYTES || 5 * 1024 * 1024);

const previewChunkSize = chunkSizeBytes;

const uploadChunkSize = chunkSizeBytes;

const formatBytes = (bytes) => {
  const size = Number(bytes);
  if (!size) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const unitIndex = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  return `${(size / 1024 ** unitIndex).toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
};

const chunkVariants = {
  hidden: (index) => ({
    opacity: 0,
    scale: 0.35,
    x: index % 2 === 0 ? -56 : 56,
    y: -38,
    rotate: index % 2 === 0 ? -8 : 8
  }),
  visible: (index) => ({
    opacity: 1,
    scale: 1,
    x: 0,
    y: 0,
    rotate: 0,
    transition: {
      delay: 0.06 * index,
      type: 'spring',
      stiffness: 180,
      damping: 18
    }
  })
};

const hashFile = async (file) => {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const getUploadErrorMessage = (error) => {
  if (error.response?.data?.message) return error.response.data.message;

  if (error.code === 'ERR_NETWORK') {
    return 'Upload failed before the server returned a response. Check the deployed API URL and backend logs.';
  }

  if (error.code === 'ECONNABORTED') {
    return 'Upload timed out. Please try again.';
  }

  return error.message || 'Upload failed. Please try again.';
};

const FileUpload = () => {
  const navigate = useNavigate();
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadedChunks, setUploadedChunks] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const previewChunkCount = useMemo(
    () => (selectedFile ? Math.ceil(selectedFile.size / previewChunkSize) : 0),
    [selectedFile]
  );

  const animatedChunks = useMemo(() => {
    if (uploadedChunks.length) return uploadedChunks;
    if (!isUploading || !selectedFile) return [];

    // Show a compact preview while the backend receives and splits the file.
    return Array.from({ length: Math.min(previewChunkCount, 12) }, (_, index) => ({
      id: `preview-${index}`,
      chunk_index: index + 1
    }));
  }, [isUploading, previewChunkCount, selectedFile, uploadedChunks]);

  const chooseFile = (file) => {
    setSelectedFile(file);
    setUploadedChunks([]);
    setProgress(0);
    setMessage('');
    setError('');
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);

    const droppedFile = event.dataTransfer.files?.[0];
    if (droppedFile) chooseFile(droppedFile);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('Please choose a file first.');
      return;
    }

    setIsUploading(true);
    setError('');
    setMessage('');
    setProgress(0);
    setUploadedChunks([]);

    const chunkCount = Math.ceil(selectedFile.size / uploadChunkSize);
    let createdFileId = null;

    try {
      const startResponse = await api.post('/files/upload/start', {
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        chunkCount
      });
      createdFileId = startResponse.data.file.id;

      const completedChunks = [];

      for (let index = 0; index < chunkCount; index += 1) {
        const chunkStart = index * uploadChunkSize;
        const chunkEnd = Math.min(selectedFile.size, chunkStart + uploadChunkSize);
        const chunk = selectedFile.slice(chunkStart, chunkEnd);
        const formData = new FormData();

        formData.append('chunk', chunk, selectedFile.name);
        formData.append('chunkIndex', String(index + 1));

        const chunkResponse = await api.post(`/files/upload/${createdFileId}/chunk`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (event) => {
            const chunkLoaded = event.loaded || 0;
            const percent = Math.round(((chunkStart + chunkLoaded) / selectedFile.size) * 100);
            setProgress(Math.min(99, percent));
          }
        });

        completedChunks.push(chunkResponse.data.chunk);
        setUploadedChunks([...completedChunks]);
        setProgress(Math.min(99, Math.round((chunkEnd / selectedFile.size) * 100)));
      }

      const checksum = crypto.subtle ? await hashFile(selectedFile) : '';
      const response = await api.post(`/files/upload/${createdFileId}/complete`, {
        contentType: selectedFile.type || 'application/octet-stream',
        checksum
      });

      setProgress(100);
      setUploadedChunks(response.data.chunks || completedChunks);
      setMessage('Upload complete. Opening My Files...');

      window.setTimeout(() => {
        navigate('/files');
      }, 900);
    } catch (uploadError) {
      if (createdFileId) {
        api.delete(`/files/${createdFileId}`).catch(() => {});
      }

      setError(getUploadErrorMessage(uploadError));
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <section className="rounded-md border border-white/70 bg-white/90 p-6 shadow-xl shadow-slate-950/10 backdrop-blur lg:p-8">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`flex min-h-72 flex-col items-center justify-center rounded-md border-2 border-dashed p-8 text-center transition ${
          isDragging
            ? 'border-teal-500 bg-teal-50'
            : 'border-slate-300 bg-gradient-to-br from-white to-sky-50'
        }`}
      >
        <motion.div
          animate={{ y: isDragging ? -6 : 0, scale: isDragging ? 1.04 : 1 }}
          className="grid h-20 w-20 place-items-center rounded-md bg-slate-950 text-4xl text-white shadow-xl shadow-slate-950/20"
        >
          <FaCloudUploadAlt />
        </motion.div>

        <h2 className="mt-6 text-2xl font-bold text-slate-950">Upload File</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
          Drag a file into the upload area or select it from your device.
        </p>

        <label className="mt-6 inline-flex cursor-pointer items-center gap-2 rounded-md bg-teal-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-teal-700">
          <FaFolderOpen />
          Select File
          <input
            type="file"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) chooseFile(file);
            }}
          />
        </label>
      </div>

      {selectedFile && (
        <div className="mt-6 rounded-md border border-slate-200 bg-slate-50 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <motion.div
              layout
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex min-w-0 items-center gap-3"
            >
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-white text-xl text-teal-700 shadow-sm">
                <FaFileAlt />
              </div>
              <div className="min-w-0">
                <p className="truncate font-bold text-slate-950">{selectedFile.name}</p>
                <p className="text-sm text-slate-600">{formatBytes(selectedFile.size)}</p>
              </div>
            </motion.div>

            <button
              type="button"
              onClick={handleUpload}
              disabled={isUploading}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isUploading ? <FaSpinner className="animate-spin" /> : <FaCloudUploadAlt />}
              {isUploading ? 'Uploading' : 'Start Upload'}
            </button>
          </div>
        </div>
      )}

      {(isUploading || progress > 0) && (
        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-700">
            <span>Upload progress</span>
            <span>{progress}%</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-slate-200">
            <motion.div
              initial={false}
              animate={{ width: `${progress}%` }}
              className="h-full rounded-full bg-gradient-to-r from-teal-500 via-sky-500 to-slate-900"
            />
          </div>
        </div>
      )}

      <AnimatePresence>
        {selectedFile && animatedChunks.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="mt-8"
          >
            <div className="mb-4 flex items-center gap-3">
              <div className="hidden h-px flex-1 bg-slate-200 sm:block" />
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-slate-500">
                Chunking Process
              </p>
              <div className="hidden h-px flex-1 bg-slate-200 sm:block" />
            </div>

            <motion.div
              layout
              className="mx-auto mb-5 grid h-24 max-w-sm place-items-center rounded-md border border-slate-200 bg-white shadow-sm"
              animate={{
                scale: uploadedChunks.length ? 0.92 : 1,
                opacity: uploadedChunks.length ? 0.8 : 1
              }}
            >
              <div className="flex items-center gap-3 px-4">
                <FaFileAlt className="text-2xl text-slate-950" />
                <span className="truncate text-sm font-bold text-slate-900">{selectedFile.name}</span>
              </div>
            </motion.div>

            <motion.div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {animatedChunks.map((chunk, index) => (
                <motion.div
                  key={chunk.id}
                  custom={index}
                  variants={chunkVariants}
                  initial="hidden"
                  animate="visible"
                  className="rounded-md border border-teal-200 bg-teal-50 px-3 py-4 text-center text-sm font-bold text-teal-900 shadow-sm"
                >
                  Chunk {chunk.chunk_index}
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {message && (
        <div className="mt-6 flex items-center gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
          <FaCheckCircle />
          {message}
        </div>
      )}

      {error && (
        <div className="mt-6 flex items-center gap-3 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
          <FaTimesCircle />
          {error}
        </div>
      )}
    </section>
  );
};

export default FileUpload;
