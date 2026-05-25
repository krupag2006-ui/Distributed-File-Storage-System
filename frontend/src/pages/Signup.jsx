import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FaCheckCircle, FaEnvelope, FaLock, FaUser } from 'react-icons/fa';
import api from '../services/api';

const Signup = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const updateField = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  const validate = () => {
    if (!form.name.trim() || !form.email.trim() || !form.password || !form.confirmPassword) {
      return 'All fields are required.';
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      return 'Please enter a valid email address.';
    }

    if (form.password.length < 6) {
      return 'Password must be at least 6 characters.';
    }

    if (form.password !== form.confirmPassword) {
      return 'Passwords do not match.';
    }

    return '';
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    const validationMessage = validate();
    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    setLoading(true);

    try {
      const response = await api.post('/auth/signup', form);
      setSuccess(response.data.message || 'Signup successful.');
      setTimeout(() => navigate('/login'), 1000);
    } catch (signupError) {
      setError(signupError.response?.data?.message || 'Signup failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-br from-indigo-950 via-indigo-700 to-purple-700 px-4 py-10">
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg rounded-md border border-white/30 bg-white/15 p-8 shadow-glass backdrop-blur-xl"
      >
        <div className="mb-8 text-center text-white">
          <h1 className="text-3xl font-bold tracking-normal">Create Account</h1>
          <p className="mt-3 text-sm text-indigo-100">Start storing chunked files securely.</p>
        </div>

        <form onSubmit={submit} className="space-y-5">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-indigo-50">Full Name</span>
            <span className="flex items-center gap-3 rounded-md border border-white/30 bg-white/90 px-4 py-3 text-slate-800">
              <FaUser className="text-indigo-600" />
              <input
                name="name"
                type="text"
                value={form.name}
                onChange={updateField}
                className="w-full bg-transparent outline-none"
                placeholder="Your name"
              />
            </span>
          </label>

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

          <div className="grid gap-5 sm:grid-cols-2">
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
                  placeholder="******"
                />
              </span>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-indigo-50">
                Confirm Password
              </span>
              <span className="flex items-center gap-3 rounded-md border border-white/30 bg-white/90 px-4 py-3 text-slate-800">
                <FaLock className="text-indigo-600" />
                <input
                  name="confirmPassword"
                  type="password"
                  value={form.confirmPassword}
                  onChange={updateField}
                  className="w-full bg-transparent outline-none"
                  placeholder="******"
                />
              </span>
            </label>
          </div>

          {error && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
              {error}
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
              <FaCheckCircle />
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-white px-5 py-3 font-bold text-indigo-700 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:bg-slate-200"
          >
            {loading ? 'Creating account...' : 'Signup'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-indigo-100">
          Already have an account?{' '}
          <Link to="/login" className="font-bold text-white underline-offset-4 hover:underline">
            Login
          </Link>
        </p>
      </motion.section>
    </main>
  );
};

export default Signup;
