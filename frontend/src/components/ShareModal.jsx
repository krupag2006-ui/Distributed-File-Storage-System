import { useState } from 'react';
import { FaClipboard, FaCopy, FaSpinner } from 'react-icons/fa';
import api from '../services/api';

const ShareModal = ({ file, isOpen, onClose, onShareCreated }) => {
  const [accessType, setAccessType] = useState('download');
  const [expiryDate, setExpiryDate] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  if (!isOpen || !file) return null;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareLink);
    setSuccessMessage('Link copied to clipboard.');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccessMessage('');
    setLoading(true);

    try {
      const response = await api.post('/share/share-file', {
        fileId: file.id,
        accessType,
        expiryDate: expiryDate || null,
        isPublic
      });

      const token = response.data.share.token;
      const link = `${window.location.origin}/shared/${token}`;
      setShareLink(link);
      setSuccessMessage('Share link created successfully.');
      onShareCreated?.();
    } catch (shareError) {
      setError(shareError.response?.data?.message || 'Unable to create share link.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-950">Share {file.file_name}</h2>
            <p className="mt-1 text-sm text-slate-600">
              Create a secure shareable link and configure link permissions.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-slate-100 px-3 py-2 text-slate-700 hover:bg-slate-200"
          >
            Close
          </button>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Permission</span>
              <select
                value={accessType}
                onChange={(event) => setAccessType(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm outline-none focus:border-indigo-500"
              >
                <option value="read-only">Read only</option>
                <option value="download">Download only</option>
                <option value="edit">Edit access</option>
                <option value="full">Full access</option>
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Expiry date</span>
              <input
                type="datetime-local"
                value={expiryDate}
                onChange={(event) => setExpiryDate(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm outline-none focus:border-indigo-500"
              />
            </label>
          </div>

          <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(event) => setIsPublic(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm font-medium text-slate-700">Make this link public</span>
          </label>

          {shareLink && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Share link</p>
              <div className="mt-2 flex items-center gap-3">
                <input
                  readOnly
                  value={shareLink}
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                  <FaCopy /> Copy
                </button>
              </div>
            </div>
          )}

          {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
          {successMessage && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{successMessage}</div>}

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {loading ? <FaSpinner className="animate-spin" /> : 'Create Share Link'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ShareModal;
