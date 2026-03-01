import { formatCurrency } from '../utils/formatters';

interface BarChartProps {
  data: { label: string; value: number }[];
  height?: number;
}

export default function BarChart({ data, height = 200 }: BarChartProps) {
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="w-full">
      <div className="flex items-end justify-between gap-2" style={{ height }}>
        {data.map((item, i) => {
          const barHeight = max > 0 ? (item.value / max) * 100 : 0;
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end group">
              {/* Tooltip */}
              <div className="opacity-0 group-hover:opacity-100 transition-opacity text-xs font-medium text-gray-700 bg-white px-2 py-1 rounded-lg shadow-md whitespace-nowrap">
                {formatCurrency(item.value)}
              </div>
              {/* Bar */}
              <div
                className="w-full max-w-12 rounded-t-lg bg-gradient-to-t from-violet-600 to-violet-400 transition-all duration-500 ease-out hover:from-violet-500 hover:to-cyan-400"
                style={{ height: `${barHeight}%`, minHeight: item.value > 0 ? 4 : 0 }}
              />
            </div>
          );
        })}
      </div>
      {/* Labels */}
      <div className="flex justify-between gap-2 mt-2">
        {data.map((item, i) => (
          <div key={i} className="flex-1 text-center text-xs font-medium text-gray-500">
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}
