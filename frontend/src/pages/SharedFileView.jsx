import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FaDownload, FaSpinner } from 'react-icons/fa';
import Navbar from '../components/Navbar';
import api from '../services/api';

const SharedFileView = () => {
  const { token } = useParams();
  const [share, setShare] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

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

  const fetchShare = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await api.get(`/share/shared/${token}`);
      setShare(response.data.share);
    } catch (fetchError) {
      setError(fetchError.response?.data?.message || 'Unable to load shared file.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShare();
  }, [token]);

  const downloadFile = async () => {
    if (!share) return;

    setDownloading(true);
    setDownloadProgress(0);
    setError('');

    try {
      const response = await api.get(`/share/download/${token}`, {
        responseType: 'arraybuffer',
        onDownloadProgress: (event) => {
          if (event.total) {
            setDownloadProgress(Math.round((event.loaded / event.total) * 100));
          }
        }
      });

      const blob = new Blob([response.data], {
        type: response.headers['content-type'] || 'application/octet-stream'
      });
      downloadBlob(blob, share.fileName);
    } catch (downloadError) {
      setError(downloadError.response?.data?.message || 'Download failed.');
    } finally {
      setDownloading(false);
      setDownloadProgress(0);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-100">
      <Navbar />
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <section className="rounded-3xl border border-white/70 bg-white/85 p-8 shadow-xl shadow-indigo-950/10 backdrop-blur">
          {loading ? (
            <div className="text-center text-slate-500">
              <FaSpinner className="mx-auto mb-3 animate-spin text-3xl text-indigo-600" />
              Loading shared file...
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-6 py-5 text-slate-700">
              {error}
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <h1 className="text-3xl font-bold text-slate-950">Shared file</h1>
                <p className="mt-2 text-sm text-slate-600">Access details for your shared file link.</p>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-sm uppercase tracking-[0.18em] text-slate-500">File</p>
                    <p className="mt-2 text-xl font-semibold text-slate-950">{share.fileName}</p>
                  </div>
                  <div>
                    <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Access</p>
                    <p className="mt-2 text-xl font-semibold text-slate-950">{share.accessType}</p>
                  </div>
                  <div>
                    <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Owner</p>
                    <p className="mt-2 text-slate-950">{share.ownerName} - {share.ownerEmail}</p>
                  </div>
                  <div>
                    <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Expiry</p>
                    <p className="mt-2 text-slate-950">{share.expiryDate || 'No expiry'}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-6">
                <dl className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <dt className="text-xs uppercase tracking-[0.24em] text-slate-500">Chunk count</dt>
                    <dd className="mt-2 text-xl font-semibold text-slate-950">{share.chunkCount}</dd>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <dt className="text-xs uppercase tracking-[0.24em] text-slate-500">Link type</dt>
                    <dd className="mt-2 text-xl font-semibold text-slate-950">{share.isPublic ? 'Public' : 'Private'}</dd>
                  </div>
                </dl>
                {['download', 'edit', 'full'].includes(share.accessType) && (
                  <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <button
                      type="button"
                      onClick={downloadFile}
                      disabled={downloading}
                      className="inline-flex items-center justify-center gap-2 rounded-md bg-indigo-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-800 disabled:bg-slate-400"
                    >
                      {downloading ? <FaSpinner className="animate-spin" /> : <FaDownload />}
                      Download
                    </button>
                    {downloading && (
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 sm:max-w-xs">
                        <div
                          className="h-full bg-indigo-600 transition-all"
                          style={{ width: `${downloadProgress || 8}%` }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default SharedFileView;
