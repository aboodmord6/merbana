import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function Layout() {
  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-14 pb-6 lg:pt-8 lg:pb-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
