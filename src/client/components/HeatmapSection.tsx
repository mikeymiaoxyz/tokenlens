import { useMemo } from 'react';

interface HourlyActivityEntry {
  date: string;
  hour: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  totalCost: number;
  calls: number;
}

const HOURS = Array.from({ length: 24 }, (_: number, i: number) => i);
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface HeatmapSectionProps {
  entries: HourlyActivityEntry[];
  metric: 'tokens' | 'usd';
  isToday: boolean;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) +'K';
  return n.toString();
}

export function HeatmapSection({ entries, metric, isToday }: HeatmapSectionProps) {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const currentHour = now.getHours();

  const { grid, maxVal } = useMemo(() => {
    const g: number[][] = Array(7).fill(0).map(() => Array(24).fill(0));
    let max = 0;

    for (const entry of entries) {
const d = new Date(entry.date);
      const day = d.getDay();
      const hour = entry.hour;

      if (isToday && entry.date === todayStr && hour > currentHour) continue;

      const val = metric === 'tokens' ? entry.totalTokens : entry.totalCost;
      g[day][hour] += val;
      if (g[day][hour] > max) max = g[day][hour];
    }

    return { grid: g, maxVal: max };
  }, [entries, metric, isToday, todayStr, currentHour]);

  const getColor = (val: number): string => {
    if (val === 0 || maxVal === 0) return '#f5f5f4';
    const intensity = val / maxVal;
    if (intensity < 0.25) return '#c7d2fe';
    if (intensity < 0.5) return '#a5b4fc';
    if (intensity < 0.75) return '#818cf8';
    return '#4f46e5';
  };

  return (
<div className="bg-white rounded-2xl p-5 shadow-[0_1px_3px_rgba(120,113,108,0.06)]">
      <div className="mb-4">
        <h3 className="text-base font-bold text-stone-800">24-Hour Activity Heatmap</h3>
        <p className="text-[12px] text-stone-400 mt-0.5">Activity by hour and day of week</p>
      </div>

      <div className="overflow-x-auto">
<div className="flex flex-col gap-1">
          <div className="flex gap-1 ml-10">
            {HOURS.map((h: number) => (
              <div key={h} className="w-8 text-[10px] text-stone-400 text-center flex-shrink-0">
                {h % 3 === 0 ? h : ''}
              </div>
            ))}
          </div>

          {grid.map((row, dayIdx) => (
            <div key={dayIdx} className="flex gap-1 items-center">
              <div className="w-10 text-[10px] text-stone-400 text-right pr-2 flex-shrink-0">{DAYS[dayIdx]}</div>
              {row.map((val, hourIdx) => (
                <div
key={hourIdx}
                  className="w-8 h-8 rounded-sm cursor-pointer transition-all hover:ring-2 hover:ring-indigo-400 relative flex-shrink-0"
                  style={{ backgroundColor: getColor(val) }}
                  title={`${DAYS[dayIdx]} ${hourIdx}:00 - ${metric === 'tokens' ? formatNumber(val) + ' tokens' : '$' + val.toFixed(4)}`}
                >
                  {isToday && hourIdx > currentHour && (
                    <div className="absolute inset-0 bg-stone-200/50 rounded-sm" />
                  )}
                </div>
              ))}
            </div>
          ))}

          <div className="flex items-center justify-end gap-2 mt-3">
            <span className="text-[10px] text-stone-400">Less</span>
            <div className="flex gap-1">
              {['#f5f5f4', '#c7d2fe', '#a5b4fc', '#818cf8', '#4f46e5'].map((c, i) => (
                <div key={i} className="w-4 h-4 rounded-sm" style={{ backgroundColor: c }} />
              ))}
            </div>
            <span className="text-[10px] text-stone-400">More</span>
</div>
        </div>
      </div>
    </div>
  );
}
