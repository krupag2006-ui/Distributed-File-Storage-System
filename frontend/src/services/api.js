import axios from 'axios';

const normalizeApiBaseURL = (value) => {
  if (!value) {
    return import.meta.env.DEV ? 'http://localhost:5000/api' : '/api';
  }

  const baseURL = value.replace(/\/+$/, '');
  return baseURL.endsWith('/api') ? baseURL : `${baseURL}/api`;
};

const apiBaseURL = normalizeApiBaseURL(import.meta.env.VITE_API_URL);

const api = axios.create({
  baseURL: apiBaseURL
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('dfs_token');

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('dfs_token');
      localStorage.removeItem('dfs_user');

      if (!window.location.pathname.includes('/login')) {
        window.location.assign('/login');
      }
    }

    return Promise.reject(error);
  }
);

export default api;
