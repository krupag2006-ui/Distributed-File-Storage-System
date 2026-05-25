import { useNavigate } from 'react-router-dom';
import { FaChartPie, FaCloudUploadAlt, FaDownload, FaFolderOpen } from 'react-icons/fa';
import Navbar from '../components/Navbar';
import FeatureCard from '../components/FeatureCard';

const Dashboard = () => {
  const navigate = useNavigate();

  const cards = [
    {
      icon: FaCloudUploadAlt,
      title: 'Upload File',
      description: 'Upload large files and split them into chunks.',
      buttonText: 'Upload',
      path: '/upload'
    },
    {
      icon: FaDownload,
      title: 'Download Files',
      description: 'Download full files or selected stored chunks.',
      buttonText: 'Download Full File',
      path: '/files'
    },
    {
      icon: FaFolderOpen,
      title: 'My Files',
      description: 'View uploaded files and metadata.',
      buttonText: 'View Files',
      path: '/files'
    },
    {
      icon: FaChartPie,
      title: 'Storage Analytics',
      description: 'Show statistics about stored files.',
      buttonText: 'Analytics',
      path: '/analytics'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-100">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <section className="mb-8 rounded-md bg-gradient-to-r from-indigo-700 to-purple-700 p-8 text-white shadow-xl shadow-indigo-950/15">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-indigo-100">
            Distributed File Storage System
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-normal sm:text-4xl">
            Manage chunked uploads, downloads, and storage usage.
          </h2>
        </section>

        <section className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => (
            <FeatureCard
              key={card.title}
              icon={card.icon}
              title={card.title}
              description={card.description}
              buttonText={card.buttonText}
              onClick={() => navigate(card.path)}
            />
          ))}
        </section>
      </main>
    </div>
  );
};

export default Dashboard;
