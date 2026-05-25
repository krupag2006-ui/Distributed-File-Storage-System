import Navbar from '../components/Navbar';
import FileUpload from '../components/FileUpload';

const Upload = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-100">
      <Navbar />
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <FileUpload />
      </main>
    </div>
  );
};

export default Upload;
