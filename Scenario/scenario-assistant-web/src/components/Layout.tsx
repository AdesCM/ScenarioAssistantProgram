import { Outlet, Link } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { Sun, Moon, Settings } from 'lucide-react';

const Layout = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="flex w-full h-screen bg-slate-50 dark:bg-[#0f172a] text-slate-900 dark:text-slate-100 flex-col transition-colors duration-200">
      <header className="flex h-16 shrink-0 items-center justify-between px-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1e293b] shadow-sm transition-colors duration-200">
        <Link to="/" className="flex items-center gap-2">
          <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent">
            세계관 편집기
          </h1>
        </Link>
        <div className="flex items-center gap-4">
          <button 
            onClick={toggleTheme}
            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors"
            title="테마 변경"
          >
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <Link to="/settings" className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors">
            <Settings size={20} />
          </Link>
        </div>
      </header>
      <main className="flex-1 flex overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
