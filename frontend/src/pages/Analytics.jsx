import { useEffect, useRef, useState } from 'react';
import Chart from 'chart.js/auto';
import { FaChartBar, FaDatabase, FaFileAlt, FaLayerGroup } from 'react-icons/fa';
import Navbar from '../components/Navbar';
import api from '../services/api';

const formatBytes = (bytes) => {
  const size = Number(bytes);
  if (!size) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const unitIndex = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  return `${(size / 1024 ** unitIndex).toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
};

const StatCard = ({ icon: Icon, label, value }) => (
  <article className="rounded-md border border-white/70 bg-white/85 p-5 shadow-xl shadow-indigo-950/10 backdrop-blur">
    <div className="flex items-center gap-4">
      <div className="grid h-12 w-12 place-items-center rounded-md bg-gradient-to-br from-indigo-600 to-purple-600 text-xl text-white">
        <Icon />
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-500">{label}</p>
        <p className="text-2xl font-bold text-slate-950">{value}</p>
      </div>
    </div>
  </article>
);

const Analytics = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const filesChartRef = useRef(null);
  const storageChartRef = useRef(null);
  const chartsRef = useRef([]);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const response = await api.get('/files/analytics');
        setData(response.data);
      } catch (analyticsError) {
        setError(analyticsError.response?.data?.message || 'Unable to load analytics.');
      }
    };

    fetchAnalytics();
  }, []);

  useEffect(() => {
    chartsRef.current.forEach((chart) => chart.destroy());
    chartsRef.current = [];

    if (!data || !filesChartRef.current || !storageChartRef.current) return;

    const labels = data.uploadsByDay.length
      ? data.uploadsByDay.map((item) => new Date(item.date).toLocaleDateString())
      : ['No uploads'];
    const fileCounts = data.uploadsByDay.length
      ? data.uploadsByDay.map((item) => item.fileCount)
      : [0];
    const storageValues = data.uploadsByDay.length
      ? data.uploadsByDay.map((item) => Number((item.storageUsed / (1024 * 1024)).toFixed(2)))
      : [0];

    chartsRef.current.push(
      new Chart(filesChartRef.current, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Files',
              data: fileCounts,
              backgroundColor: 'rgba(79, 70, 229, 0.82)',
              borderRadius: 6
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            y: { beginAtZero: true, ticks: { precision: 0 } }
          }
        }
      })
    );

    chartsRef.current.push(
      new Chart(storageChartRef.current, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Storage MB',
              data: storageValues,
              borderColor: 'rgb(147, 51, 234)',
              backgroundColor: 'rgba(147, 51, 234, 0.15)',
              borderWidth: 3,
              fill: true,
              tension: 0.35
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            y: { beginAtZero: true }
          }
        }
      })
    );

    return () => {
      chartsRef.current.forEach((chart) => chart.destroy());
      chartsRef.current = [];
    };
  }, [data]);

  const summary = data?.summary || {
    totalFiles: 0,
    totalStorage: 0,
    averageFileSize: 0,
    totalChunks: 0
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-100">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-slate-950">Storage Analytics</h2>
          <p className="mt-2 text-sm text-slate-600">Statistics for uploaded files and stored chunks.</p>
        </div>

        {error && (
          <div className="mb-6 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
            {error}
          </div>
        )}

        <section className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={FaFileAlt} label="Total Files Uploaded" value={summary.totalFiles} />
          <StatCard icon={FaDatabase} label="Total Storage Used" value={formatBytes(summary.totalStorage)} />
          <StatCard icon={FaChartBar} label="Average File Size" value={formatBytes(summary.averageFileSize)} />
          <StatCard icon={FaLayerGroup} label="Total Chunks Stored" value={summary.totalChunks} />
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-2">
          <article className="rounded-md border border-white/70 bg-white/85 p-6 shadow-xl shadow-indigo-950/10 backdrop-blur">
            <h3 className="text-lg font-bold text-slate-950">Files Uploaded</h3>
            <div className="mt-5 h-80">
              <canvas ref={filesChartRef} />
            </div>
          </article>

          <article className="rounded-md border border-white/70 bg-white/85 p-6 shadow-xl shadow-indigo-950/10 backdrop-blur">
            <h3 className="text-lg font-bold text-slate-950">Storage Used</h3>
            <div className="mt-5 h-80">
              <canvas ref={storageChartRef} />
            </div>
          </article>
        </section>
      </main>
    </div>
  );
};

export default Analytics;
