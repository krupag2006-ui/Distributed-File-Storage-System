import { FaCubes, FaDownload, FaSpinner } from 'react-icons/fa';

const DownloadOptions = ({ file, isDownloadingFull, onDownloadFull, onShowChunks }) => {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-slate-950">Download Options</h3>
          <p className="mt-1 truncate text-sm text-slate-600">{file.file_name}</p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onDownloadFull}
            disabled={isDownloadingFull}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-950 px-4 py-3 text-sm font-bold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isDownloadingFull ? <FaSpinner className="animate-spin" /> : <FaDownload />}
            Download Full File
          </button>

          <button
            type="button"
            onClick={onShowChunks}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-bold text-teal-800 transition hover:border-teal-300 hover:bg-teal-100"
          >
            <FaCubes />
            Download Chunk
          </button>
        </div>
      </div>
    </section>
  );
};

export default DownloadOptions;
