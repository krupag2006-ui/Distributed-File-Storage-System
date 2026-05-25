import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FaEnvelope, FaLock } from 'react-icons/fa';
import api from '../services/api';

const Login = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const updateField = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');

    if (!form.email || !form.password) {
      setError('Email and password are required.');
      return;
    }

    setLoading(true);

    try {
      const response = await api.post('/auth/login', form);
      localStorage.setItem('dfs_token', response.data.token);
      localStorage.setItem('dfs_user', JSON.stringify(response.data.user));
      navigate('/dashboard');
    } catch (loginError) {
      setError(loginError.response?.data?.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-br from-indigo-950 via-indigo-700 to-purple-700 px-4 py-10">
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-md border border-white/30 bg-white/15 p-8 shadow-glass backdrop-blur-xl"
      >
        <div className="mb-8 text-center text-white">
          <h1 className="text-3xl font-bold tracking-normal">Distributed File Storage System</h1>
          <p className="mt-3 text-sm text-indigo-100">Sign in to continue to your dashboard.</p>
        </div>

        <form onSubmit={submit} className="space-y-5">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-indigo-50">Email</span>
            <span className="flex items-center gap-3 rounded-md border border-white/30 bg-white/90 px-4 py-3 text-slate-800">
              <FaEnvelope className="text-indigo-600" />
              <input
                name="email"
                type="email"
                value={form.email}
                onChange={updateField}
                className="w-full bg-transparent outline-none"
                placeholder="you@example.com"
              />
            </span>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-indigo-50">Password</span>
            <span className="flex items-center gap-3 rounded-md border border-white/30 bg-white/90 px-4 py-3 text-slate-800">
              <FaLock className="text-indigo-600" />
              <input
                name="password"
                type="password"
                value={form.password}
                onChange={updateField}
                className="w-full bg-transparent outline-none"
                placeholder="********"
              />
            </span>
          </label>

          {error && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-white px-5 py-3 font-bold text-indigo-700 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:bg-slate-200"
          >
            {loading ? 'Signing in...' : 'Login'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-indigo-100">
          New here?{' '}
          <Link to="/signup" className="font-bold text-white underline-offset-4 hover:underline">
            Create an account
          </Link>
        </p>
      </motion.section>
    </main>
  );
};

export default Login;
