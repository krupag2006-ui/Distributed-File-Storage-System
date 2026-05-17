import { Link, NavLink, useNavigate } from 'react-router-dom';
import { FaCloud, FaSignOutAlt, FaUserCircle } from 'react-icons/fa';

const navLinkClass = ({ isActive }) =>
  `rounded-md px-3 py-2 text-sm font-semibold transition ${
    isActive
      ? 'bg-white text-indigo-700 shadow-sm'
      : 'text-indigo-100 hover:bg-white/15 hover:text-white'
  }`;

const Navbar = () => {
  const navigate = useNavigate();
  const storedUser = localStorage.getItem('dfs_user');
  const user = storedUser ? JSON.parse(storedUser) : null;

  const logout = () => {
    localStorage.removeItem('dfs_token');
    localStorage.removeItem('dfs_user');
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-30 border-b border-white/20 bg-indigo-950/85 shadow-lg shadow-indigo-950/10 backdrop-blur-xl">
      <nav className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <Link to="/dashboard" className="flex items-center gap-3 text-white">
          <span className="grid h-11 w-11 place-items-center rounded-md bg-white text-indigo-700 shadow-lg shadow-indigo-950/20">
            <FaCloud className="text-2xl" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-indigo-200">
              Project
            </p>
            <h1 className="text-xl font-bold tracking-normal">Distributed File Storage</h1>
          </div>
        </Link>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between lg:gap-6">
          <div className="flex flex-wrap items-center gap-2">
            <NavLink to="/dashboard" className={navLinkClass}>
              Dashboard
            </NavLink>
            <NavLink to="/upload" className={navLinkClass}>
              Upload
            </NavLink>
            <NavLink to="/files" className={navLinkClass}>
              My Files
            </NavLink>
            <NavLink to="/shared-files" className={navLinkClass}>
              Shared Files
            </NavLink>
            <NavLink to="/analytics" className={navLinkClass}>
              Analytics
            </NavLink>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-md bg-white/10 px-3 py-2 text-white">
            <FaUserCircle className="text-2xl text-indigo-100" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{user?.name || 'User'}</p>
              <p className="truncate text-xs text-indigo-200">{user?.email || ''}</p>
            </div>
            <button
              type="button"
              onClick={logout}
              className="grid h-10 w-10 place-items-center rounded-md bg-white text-indigo-700 transition hover:bg-indigo-50"
              aria-label="Logout"
              title="Logout"
            >
              <FaSignOutAlt />
            </button>
          </div>
        </div>
      </nav>
    </header>
  );
};

export default Navbar;
