import { Link } from 'react-router-dom';

interface StatCardProps {
  icon: string;
  label: string;
  value: string | number;
  subtext?: string;
  to?: string;
}

export default function StatCard({ icon, label, value, subtext, to }: StatCardProps) {
  const inner = (
    <>
      <div className="flex items-center gap-3 mb-3">
        <span className="text-2xl">{icon}</span>
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {subtext && <p className="text-xs text-gray-500 mt-1">{subtext}</p>}
    </>
  );

  if (to) {
    return (
      <Link
        to={to}
        className="block bg-white/70 backdrop-blur-md rounded-2xl p-5 border border-gray-200/50 shadow-sm hover:shadow-md hover:border-violet-200 hover:ring-1 hover:ring-violet-100 transition-all group"
      >
        {inner}
        <p className="text-xs text-violet-500 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">اضغط للعرض ←</p>
      </Link>
    );
  }

  return (
    <div className="bg-white/70 backdrop-blur-md rounded-2xl p-5 border border-gray-200/50 shadow-sm hover:shadow-md transition-shadow">
      {inner}
    </div>
  );
}
