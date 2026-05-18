import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'https://distributed-file-storage-system-hun8.onrender.com/api'
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
