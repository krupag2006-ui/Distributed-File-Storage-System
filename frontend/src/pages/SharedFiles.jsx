import { useEffect, useState } from 'react';
import { FaCopy, FaLink, FaSpinner, FaTrash } from 'react-icons/fa';
import Navbar from '../components/Navbar';
import api from '../services/api';

const SharedFiles = () => {
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState(null);

  const fetchShares = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await api.get('/share/shared-files');
      setShares(response.data.sharedFiles || []);
    } catch (fetchError) {
      setError(fetchError.response?.data?.message || 'Unable to load shared files.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShares();
  }, []);

  const handleCopy = async (token) => {
    const url = `${window.location.origin}/shared/${token}`;
    await navigator.clipboard.writeText(url);
    setMessage('Copy link to clipboard.');
  };

  const handleDelete = async (id) => {
    setError('');
    setMessage('');

    try {
      await api.delete(`/share/share/${id}`);
      setMessage('Share link deleted successfully.');
      fetchShares();
    } catch (deleteError) {
      setError(deleteError.response?.data?.message || 'Unable to delete share link.');
    }
  };

  const updateShare = async (share, updates) => {
    setSavingId(share.id);
    setError('');
    setMessage('');

    try {
      await api.put(`/share/permissions/${share.id}`, {
        accessType: updates.accessType ?? share.access_type,
        expiryDate: updates.expiryDate ?? share.expiry_date,
        isPublic: updates.isPublic ?? Boolean(share.is_public)
      });
      setMessage('Share permissions updated.');
      fetchShares();
    } catch (updateError) {
      setError(updateError.response?.data?.message || 'Unable to update share permissions.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-100">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <section className="rounded-md border border-white/70 bg-white/85 p-6 shadow-xl shadow-indigo-950/10 backdrop-blur">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-slate-950">Shared Files</h2>
              <p className="mt-2 text-sm text-slate-600">Manage your share links, copy links, and revoke access.</p>
            </div>
          </div>

          {message && <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</div>}
          {error && <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wider text-slate-600">File</th>
                    <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wider text-slate-600">Permission</th>
                    <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wider text-slate-600">Expiry</th>
                    <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wider text-slate-600">Link</th>
                    <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wider text-slate-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan="5" className="px-4 py-12 text-center text-slate-500">
                        <FaSpinner className="mx-auto mb-3 animate-spin text-2xl text-indigo-600" />
                        Loading shared files...
                      </td>
                    </tr>
                  ) : shares.length ? (
                    shares.map((share) => (
                      <tr key={share.id} className="hover:bg-indigo-50/50">
                        <td className="px-4 py-4 text-slate-700">{share.file_name}</td>
                        <td className="px-4 py-4 text-slate-700">
                          <select
                            value={share.access_type}
                            disabled={savingId === share.id}
                            onChange={(event) => updateShare(share, { accessType: event.target.value })}
                            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500"
                          >
                            <option value="read-only">Read only</option>
                            <option value="download">Download only</option>
                            <option value="edit">Edit access</option>
                            <option value="full">Full access</option>
                          </select>
                        </td>
                        <td className="px-4 py-4 text-slate-700">
                          <div className="flex flex-col gap-2">
                            <input
                              type="datetime-local"
                              disabled={savingId === share.id}
                              defaultValue={share.expiry_date ? share.expiry_date.slice(0, 16) : ''}
                              onBlur={(event) => updateShare(share, { expiryDate: event.target.value || null })}
                              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500"
                            />
                            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
                              <input
                                type="checkbox"
                                checked={Boolean(share.is_public)}
                                disabled={savingId === share.id}
                                onChange={(event) => updateShare(share, { isPublic: event.target.checked })}
                                className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                              />
                              Public link
                            </label>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <button
                            type="button"
                            onClick={() => handleCopy(share.share_token)}
                            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-white transition hover:bg-indigo-700"
                          >
                            <FaCopy /> Copy
                          </button>
                        </td>
                        <td className="px-4 py-4">
                          <button
                            type="button"
                            onClick={() => handleDelete(share.id)}
                            className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-3 py-2 text-white transition hover:bg-rose-700"
                          >
                            <FaTrash /> Revoke
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5" className="px-4 py-12 text-center text-slate-500">
                        No share links available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default SharedFiles;
