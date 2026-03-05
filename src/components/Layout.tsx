import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function Layout() {
  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden print:block print:h-auto print:overflow-visible print:bg-white">
      <Sidebar />
      <main className="flex-1 overflow-y-auto print:overflow-visible">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-14 pb-6 lg:pt-8 lg:pb-8 print:max-w-full print:p-0 print:m-0">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
