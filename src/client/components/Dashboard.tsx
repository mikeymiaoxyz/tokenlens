import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  BarChart, Bar, Cell, LineChart, Line,
  ComposedChart, AreaChart, Area, PieChart, Pie,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {fetchDaily, fetchProjects, fetchProviders, fetchAnalytics, fetchHourlyActivity, TimeRangeKey } from '../api/client.js';
import type { ProviderStatusDTO } from '../../shared/types.js';
import { useCcusageData } from '../hooks/useCcusageData.js';
import { useLocalStorageState } from '../hooks/useLocalStorageState.js';
import { formatDate, formatTokens, formatUSD, formatPercent, formatProjectName } from '../utils/formatters.js';
import { costSavedByCache } from '../utils/cacheCalculations.js';
import { shortModelName } from '../utils/modelNames.js';
import { isSyntheticModel }from '../utils/syntheticModelFilter.js';
import { AnalyticsSection } from './AnalyticsSection.js';
import { HeatmapSection } from './HeatmapSection.js';
import type { DailyEntry, MetricMode } from '../../shared/types.js';

const C = ['#4f46e5', '#10b981', '#f59e0b', '#ec4899', '#0ea5e9', '#8b5cf6', '#ef4444', '#14b8a6'];

const TIME_RANGES = [
  { key: 'today', label: 'Today', days: 1 },
  { key: '7d', label: '7D', days: 7 },
  { key: '30d', label: '30D', days: 30 },
  { key: '60d', label: '60D', days: 60 },
  { key: 'all', label: 'ALL', days: 0 },
] as const;

type LocalTimeRangeKey = typeof TIME_RANGES[number]['key'];

function InsightCard({ label, title, detail, badge }: { label: string; title: string; detail: string; badge?: string }) {
  return (
    <div className="flex flex-col justify-between rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(120,113,108,0.06)] transition-shadow duration-200 hover:shadow-[0_4px_12px_rgba(120,113,108,0.09)]">
      <div className="mb-3 flex items-start justify-between gap-3">
        <p className="text-[12px] font-medium text-stone-400">{label}</p>
        {badge ? <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-indigo-600">{badge}</span> : null}
      </div>
      <div>
        <p className="text-2xl font-extrabold tracking-tight text-stone-900">{title}</p>
        <p className="mt-1.5 text-[13px] font-medium leading-relaxed text-stone-500">{detail}</p>
      </div>
    </div>
  );
}

function KPICard({ label, value, sub, insight, accent }: { label: string; value: string; sub?: string; insight?: string; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-1 p-5 rounded-2xl bg-white shadow-[0_1px_3px_rgba(120,113,108,0.06)] transition-shadow duration-200 hover:shadow-[0_4px_12px_rgba(120,113,108,0.09)]">
      <span className="text-[12px] font-medium text-stone-400">{label}</span>
      <span className={`text-3xl font-extrabold tracking-tighter font-mono mt-1 ${accent ? 'text-indigo-600' : 'text-stone-900'}`}>{value}</span>
      {sub && <span className="text-xs font-medium text-stone-400 mt-0.5">{sub}</span>}
      {insight && <div className="mt-2.5 pt-2.5 border-t border-stone-100 text-[12px] font-medium text-stone-500 leading-relaxed">{insight}</div>}
    </div>
  );
}

function Panel({ title, subtitle, children, className = '' }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(120,113,108,0.06)] ${className}`}>
      <div className="mb-5">
        <h3 className="text-[15px] font-semibold text-stone-900 tracking-tight">{title}</h3>
        {subtitle && <p className="text-[13px] font-medium text-stone-400 mt-1">{subtitle}</p>}
      </div>
      <div className="flex-1 min-h-0">
        {children}
      </div>
    </div>
  );
}

function TooltipBox({ active, payload, label, fmt = formatTokens }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string; fmt?: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white rounded-xl px-3.5 py-3 shadow-[0_8px_30px_rgba(120,113,108,0.12)] text-[11px] border border-stone-200/40">
      {label && <div className="text-stone-400 mb-1.5 font-medium">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-5">
          <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.color }} />{p.name}</span>
          <span className="font-mono text-stone-700">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

function FilterTab({ options, value, onChange }: { options: readonly { key: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-0.5 p-0.5 bg-stone-100 rounded-lg">
      {options.map(o => (
        <button key={o.key} onClick={() => onChange(o.key)}
          className={`px-3 py-1.5 rounded-md text-[11px] font-semibold tracking-wide transition-all duration-200 ${value === o.key ? 'bg-stone-800 text-white shadow-sm' : 'text-stone-500 hover:text-stone-800 hover:bg-stone-50'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ProjectSelect({ projects, value, onChange }: { projects: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="bg-white border border-stone-200 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-stone-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 max-w-[220px]">
      <option value="">All Projects</option>
      {projects.map(p => <option key={p}value={p}>{formatProjectName(p)}</option>)}
    </select>
  );
}

function filterByTime<T extends { date?: string; startTime?: string }>(data: T[], rangeKey: TimeRangeKey): T[] {
  if (rangeKey === 'all') return data;
  if (rangeKey === 'today') {
    const now = new Date();
    const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    return data.filter(d => {
      const field = d.date || d.startTime || '';
      const dt = new Date(field);
      const fieldStr = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
      return fieldStr === todayStr;
    });
  }
  const range = TIME_RANGES.find(t => t.key === rangeKey);
  const days = range ? range.days : 30;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return data.filter(d => {
    const field = d.date || d.startTime || '';
    return new Date(field) >= cutoff;
  });
}

export function Dashboard() {
  const [providers, setProviders] = useState<ProviderStatusDTO[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);

  const [provider, setProvider] = useLocalStorageState('dashboard_provider', 'claude');
  const [timeRange, setTimeRange] = useLocalStorageState<LocalTimeRangeKey>('dashboard_timeRange', '30d');
  const [project, setProject] = useLocalStorageState('dashboard_project', '');
  const [showPricing, setShowPricing] = useState(false);
  const [metric, setMetric] = useLocalStorageState<MetricMode>('dashboard_metric', 'tokens');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    if (!showPricing) return;
    const close = () => setShowPricing(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [showPricing]);

  useEffect(() => {
    fetchProviders()
      .then((statuses) => {
        setProviders(statuses);
      })
      .catch(() => { })
      .finally(() => setProvidersLoading(false));
  }, []);

  const showProviderSwitcher = (providers?.length ?? 0) > 0;

  const dailyData = useCcusageData(useCallback(() => fetchDaily(provider, project, timeRange), [provider, project, timeRange]));
  const projectsData = useCcusageData(useCallback(() => fetchProjects(provider, timeRange), [provider, timeRange]));
  const analyticsData = useCcusageData(useCallback(() => fetchAnalytics(provider, project, timeRange), [provider, project, timeRange]));
  const hourlyData = useCcusageData(useCallback(() => fetchHourlyActivity(provider, project, timeRange), [provider, project, timeRange]));

  const handleProviderChange = (p: string) => {
    setProvider(p);
    setProject('');
  };

  const coreLoading = dailyData.loading && !dailyData.data;
  const coreError = dailyData.error && !dailyData.data;
  const isTokens = metric === 'tokens';
  const dataKey = isTokens ? 'tokens' : 'cost';
  const isToday = timeRange === 'today';

  const projectList = useMemo(() => {
    if (!projectsData.data) return [];
    return Object.keys(projectsData.data.projects || {}).sort();
  }, [projectsData.data]);

  // Filtered daily data - use dailyData as primary source
  const filteredDaily = useMemo(() => {
    if (dailyData.data) {
      return filterByTime(dailyData.data.daily, timeRange);
    }
    return [];
  }, [dailyData.data, timeRange]);

  // Aggregated data from filteredDaily
  const totals = useMemo(() => {
    return filteredDaily.reduce((acc, d) => ({
      inputTokens: acc.inputTokens + d.inputTokens,
      outputTokens: acc.outputTokens + d.outputTokens,
      cacheCreationTokens: acc.cacheCreationTokens + d.cacheCreationTokens,
      cacheReadTokens: acc.cacheReadTokens + d.cacheReadTokens,
      totalTokens: acc.totalTokens + d.totalTokens,
      totalCost: acc.totalCost + d.totalCost,
    }), { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, totalTokens: 0, totalCost: 0 });
  }, [filteredDaily]);

  const activeDays = filteredDaily.length;

  const cacheHitRate = totals.inputTokens > 0
    ? (totals.cacheReadTokens / (totals.cacheReadTokens + totals.inputTokens)) * 100
    : 0;

  const outputRatio = totals.inputTokens > 0
    ? (totals.outputTokens / totals.inputTokens) * 100
    : 0;

  // Model aggregation from daily data
  const modelAgg = useMemo(() => {
    const modelMap = new Map<string, { name: string; tokens: number; cost: number; inputTokens: number; outputTokens: number }>();
    for (const day of filteredDaily) {
      for (const breakdown of day.modelBreakdowns) {
        if (isSyntheticModel(breakdown.modelName)) continue;
        const existing = modelMap.get(breakdown.modelName);
        if (existing) {
          existing.inputTokens += breakdown.inputTokens;
          existing.outputTokens += breakdown.outputTokens;
          existing.tokens += breakdown.inputTokens + breakdown.outputTokens + breakdown.cacheCreationTokens + breakdown.cacheReadTokens;
          existing.cost += breakdown.cost;
        } else {
          modelMap.set(breakdown.modelName, {
            name: breakdown.modelName,
            inputTokens: breakdown.inputTokens,
            outputTokens: breakdown.outputTokens,
            tokens: breakdown.inputTokens + breakdown.outputTokens + breakdown.cacheCreationTokens + breakdown.cacheReadTokens,
            cost: breakdown.cost,
          });
        }
      }
    }
    return Array.from(modelMap.values()).sort((a, b) => b.tokens - a.tokens);
  }, [filteredDaily]);

  // Model trend data for chart
  const modelTrendData = useMemo(() => {
    return filteredDaily.map(d => {
      const entry: Record<string, string | number> = {
        date: formatDate(d.date),
      };
      for (const breakdown of d.modelBreakdowns) {
        if (isSyntheticModel(breakdown.modelName)) continue;
        entry[breakdown.modelName] = isTokens ? (breakdown.inputTokens + breakdown.outputTokens + breakdown.cacheCreationTokens + breakdown.cacheReadTokens) : breakdown.cost;
      }
      return entry;
    });
  }, [filteredDaily, isTokens]);

  // Cache savings
  const cacheSavings = useMemo(() => {
    const tokensSaved = totals.cacheReadTokens;
    const costSaved = costSavedByCache(tokensSaved);
    return {
      tokensSaved,
      costSaved,
      hitRate: cacheHitRate,
    };
  }, [totals.cacheReadTokens, cacheHitRate]);

  // Cache trend data
  const cacheTrendData = useMemo(() => filteredDaily.map(d => ({
    date: formatDate(d.date),
    cacheRead: d.cacheReadTokens,
    input: d.inputTokens,
    hitRate: d.inputTokens > 0 ? (d.cacheReadTokens / (d.cacheReadTokens + d.inputTokens)) * 100 : 0,
  })), [filteredDaily]);

  // Project pie data
  const projectPieData = useMemo(() => {
    if (!projectsData.data?.projects) return [];
    return Object.entries(projectsData.data.projects)
      .map(([name, entries]) => ({
        name,
        tokens: entries.reduce((sum, e) => sum + e.totalTokens, 0),
        cost: entries.reduce((sum, e) => sum + e.totalCost, 0),
      }))
      .sort((a, b) => b.tokens - a.tokens);
  }, [projectsData.data]);

  // Pinned providers
  const PINNED_PROVIDERS =['all', 'claude', 'codex', 'hermes', 'openclaw'];
  const PROVIDER_DISPLAY: Record<string, string> = {
    all: 'All',
    claude: 'Claude Code',
    codex: 'Codex',
    hermes: 'Hermes',
    openclaw: 'OpenClaw',
  };
  const otherProviders = providers.filter(p => !PINNED_PROVIDERS.includes(p.name));

  const isNonPinnedSelected = !PINNED_PROVIDERS.includes(provider);
  const selectedProvider = isNonPinnedSelected? providers.find(p => p.name === provider) : null;

  const renderProviderSwitcher = () => (
    <div className="flex items-center gap-1 p-1 bg-stone-200/50 rounded-xl w-fit shadow-inner border border-stone-200/50">
      {PINNED_PROVIDERS.map(p => (
        <button
          key={p}
          onClick={() => handleProviderChange(p)}
          className={`px-4 py-2.5 rounded-lg text-[12px] font-bold tracking-wide transition-all duration-200 ${provider === p
            ? 'bg-white text-indigo-600 shadow-[0_1px_3px_rgba(0,0,0,0.1)] ring-1 ring-indigo-500/20'
            : 'text-stone-500 hover:text-stone-800 hover:bg-stone-200/50'
            }`}
        >
          {PROVIDER_DISPLAY[p] || p}
        </button>
      ))}
      {otherProviders.length > 0 && (
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(o => !o)}
            className={`flex items-center gap-1 px-4 py-2.5 rounded-lg text-[12px] font-bold tracking-wide transition-all duration-200 ${!PINNED_PROVIDERS.includes(provider)
              ? 'bg-white text-indigo-600 shadow-[0_1px_3px_rgba(0,0,0,0.1)] ring-1 ring-indigo-500/20'
              : 'text-stone-500 hover:text-stone-800 hover:bg-stone-200/50'
              }`}
>
            {isNonPinnedSelected && selectedProvider ? selectedProvider.displayName : 'More'}
            <svg className={`w-3 h-3 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
          </button>
          {dropdownOpen && (
            <div className="absolute top-full right-0 mt-1 z-50 bg-white rounded-xl shadow-[0_8px_30px_rgba(120,113,108,0.15)] border border-stone-200/60 py-1 min-w-[160px]">
              {otherProviders.map(p => (
                <button
                  key={p.name}
                  onClick={() => { handleProviderChange(p.name); setDropdownOpen(false); }}
                  className={`w-full text-left px-4 py-2 text-[12px] font-medium transition-colors ${provider === p.name ? 'text-indigo-600 bg-indigo-50' : 'text-stone-600 hover:bg-stone-50'}`}
                >
                  {p.displayName}
                  {!p.available && <span className="ml-2 text-[10px] text-stone-400">(Unavailable)</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (coreLoading) {
    return (
      <div className="max-w-[1440px] mx-auto px-6 py-10">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-8">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-3xl font-extrabold tracking-tight text-stone-900">TokenLens</h1>
          </div>
          {showProviderSwitcher && renderProviderSwitcher()}
        </div>
        <div className="skeleton h-8 w-48 rounded-lg mb-2" />
        <div className="skeleton h-4 w-72 rounded-lg mb-8" />
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">{[...Array(6)].map((_, i) => <div key={i} className="skeleton h-20 rounded-2xl" />)}</div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4"><div className="skeleton h-72 rounded-2xl" /><div className="skeleton h-72 rounded-2xl" /></div>
      </div>
    );
  }

  if (coreError) return (
    <div className="max-w-[1440px] mx-auto px-6 py-10">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-8">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-3xl font-extrabold tracking-tight text-stone-900">TokenLens</h1>
        </div>
        {showProviderSwitcher && renderProviderSwitcher()}
      </div>
      <div className="rounded-2xl bg-red-50 border border-red-200/60 p-5"><div className="text-red-600 text-sm font-medium">{dailyData.error}</div></div>
    </div>
  );

  if (!dailyData.data) return null;

  return (
    <div className="max-w-[1440px] mx-auto px-6 py-10">
      {/* Narrative Header & Filter Bar */}
      <div className="mb-8">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-6">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-3xl font-extrabold tracking-tight text-stone-900">TokenLens</h1>
            <p className="text-[14px] font-medium text-stone-500 leading-relaxed">
              Monitor token usage and costs for your AI coding tools.
            </p>
          </div>
          {showProviderSwitcher && renderProviderSwitcher()}
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-6 p-4 bg-white rounded-2xl border border-stone-200/50 shadow-sm w-fit">
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider">Time range</span>
              <FilterTab options={TIME_RANGES} value={timeRange} onChange={v => setTimeRange(v as LocalTimeRangeKey)} />
            </div>

            {projectList.length > 0 && (
              <>
                <div className="w-px h-10 bg-stone-200/60 hidden sm:block"></div>
                <div className="flex flex-col gap-2">
                  <span className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider">Project</span>
                  <ProjectSelect projects={projectList} value={project} onChange={setProject} />
                </div>
              </>
            )}

            <div className="w-px h-10 bg-stone-200/60 hidden sm:block"></div>
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider">Metric</span>
              <FilterTab options={[{ key: 'tokens', label: 'Tokens' }, { key: 'usd', label: 'Cost' }]} value={metric} onChange={v => setMetric(v as MetricMode)} />
            </div>
          </div>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
        <KPICard label="Total tokens" value={formatTokens(totals.totalTokens)} accent insight="The primary volume indicator for the selected period." />
        <KPICard label="Input context" value={formatTokens(totals.inputTokens + totals.cacheReadTokens + totals.cacheCreationTokens)} sub="input + cache read/write" insight="Total context tokens consumed."/>
        <KPICard label="Output context" value={formatTokens(totals.outputTokens)} sub="model generated" insight="Tokens generated by models." />
        <KPICard label="Cache hit" value={formatPercent(cacheHitRate)} insight="Higher hit rate reduces cost." />
        <KPICard label="Output/Input" value={formatPercent(outputRatio)} insight="Ratio of generation to context." />
        <KPICard label="Total cost" value={formatUSD(totals.totalCost)} insight="Estimated cost for the period." />
      </div>

      {/* Model Trend (bar) + Cache Efficiency */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Panel title="Model trend" subtitle="Showing top 6 models by volume">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={modelTrendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#78716c', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#78716c', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => isTokens ? formatTokens(v) : formatUSD(v)} />
              <Tooltip content={<TooltipBox fmt={isTokens ? formatTokens : formatUSD} />} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
              {modelAgg.slice(0, 6).map((m, i) => (
                <Bar key={m.name} dataKey={m.name} stackId="1" fill={C[i % C.length]} fillOpacity={0.85} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Cache efficiency & savings">
          <div className="flex items-center gap-6 mb-4 px-4 py-3 bg-emerald-50/50 rounded-xl border border-emerald-100/50">
            <div className="flex flex-col">
              <span className="text-[11px] font-bold text-emerald-600/70 uppercase tracking-wider mb-0.5">Est. Cost Saved</span>
              <span className="text-2xl font-black text-emerald-600 tracking-tight">{formatUSD(cacheSavings.costSaved)}</span>
            </div>
            <div className="w-px h-8 bg-emerald-200/50"></div>
            <div className="flex flex-col">
              <span className="text-[11px] font-bold text-emerald-600/70 uppercase tracking-wider mb-0.5">Tokens Saved</span>
              <span className="text-lg font-extrabold text-emerald-700/80 tracking-tight font-mono">{formatTokens(cacheSavings.tokensSaved)}</span>
            </div>
            <div className="w-px h-8 bg-emerald-200/50"></div>
            <div className="flex flex-col">
              <span className="text-[11px] font-bold text-emerald-600/70 uppercase tracking-wider mb-0.5">Avg Hit Rate</span>
              <span className="text-lg font-extrabold text-emerald-700/80 tracking-tight font-mono">{formatPercent(cacheSavings.hitRate)}</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={cacheTrendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#78716c', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="left" tick={{ fill: '#78716c', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatTokens(v)} />
              <YAxis yAxisId="right" orientation="right" tick={{ fill: '#78716c', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
              <Tooltip content={<TooltipBox />} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              <Area yAxisId="left" type="monotone" dataKey="cacheRead" stroke={C[5]} fill={C[5]} fillOpacity={0.08} name="Cache Read" strokeWidth={1.5} />
              <Line yAxisId="right" type="monotone" dataKey="hitRate" stroke={C[3]} strokeWidth={2} dot={false} name="Hit Rate (%)" />
            </ComposedChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      {/* Code Change Trend + Tool Call Trend */}
      {analyticsData.data && (
        <AnalyticsSection analytics={analyticsData.data} timeRange={timeRange} />
      )}

      {/* 24-Hour Activity Heatmap */}
      {hourlyData.data && (
        <div className="mb-4">
          <HeatmapSection entries={hourlyData.data.entries} metric={isTokens ? 'tokens' :'usd'} isToday={timeRange === 'today'} />
        </div>
      )}


      {/* Non-critical request warnings */}
      {projectsData.error && (
        <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200/60 px-4 py-2.5 flex items-center gap-2 text-[12px] text-amber-700 font-medium">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          {projectsData.error && <span>Projects data unavailable</span>}
        </div>
      )}

      {/* Model Distribution + Project Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Panel title="Model distribution" subtitle="Ranked by total volume">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
              <Pie
                data={modelAgg.slice(0, 6)}
                dataKey={dataKey === 'tokens' ? 'tokens' : 'cost'}
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={2}
              >
                {modelAgg.slice(0, 6).map((_, index) => (
                  <Cell key={index} fill={C[index % C.length]} fillOpacity={0.85} stroke="transparent" />
                ))}
              </Pie>
              <Tooltip content={<TooltipBox fmt={isTokens ? formatTokens : formatUSD} />} />
              <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </Panel>

        {!project ? (
          projectsData.loading && !projectsData.data ? (
            <Panel title="Project distribution">
              <div className="flex items-center justify-center h-64 text-stone-400 text-[13px]">
                <svg className="animate-spin w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                Loading project data...
              </div>
            </Panel>
          ) : (
            <Panel title="Project distribution" subtitle={`Top 8 projects by ${isTokens ? 'tokens' : 'cost'}`}>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={projectPieData.slice(0, 8)} layout="vertical" margin={{ left: 8, right: 8, top: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" horizontal={false} />
                  <XAxis type="number" tick={{ fill: '#78716c', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => isTokens ? formatTokens(v) : formatUSD(v)} />
<YAxis type="category" dataKey="name" tick={{ fill: '#57534e', fontSize: 11 }} axisLine={false} tickLine={false} width={180} tickFormatter={(v: string) => {
                    const parts = v.split('/');
                    return parts.length > 2 ? '.../' + parts.slice(-2).join('/') : v;
                  }}/>
                  <Tooltip content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="bg-white rounded-lg shadow-lg border border-stone-200 px-3 py-2 text-[12px]">
                        <p className="font-semibold text-stone-700 mb-1">{payload[0]?.payload?.name}</p>
                        <p className="text-stone-500">{isTokens ? formatTokens(Number(payload[0]?.value) || 0) : formatUSD(Number(payload[0]?.value) || 0)}</p>
                      </div>
                    );
}} />
                  <Bar dataKey={dataKey === 'tokens' ? 'tokens' : 'cost'} radius={[0, 6, 6, 0]} maxBarSize={24}>
                    {projectPieData.slice(0, 8).map((_, index) => (
                      <Cell key={index} fill={C[index % C.length]} fillOpacity={0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Panel>
          )
        ) : project ? (
          <Panel title="Output / Input ratio" subtitle="Daily generation vs context ratio">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={cacheTrendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: '#78716c', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="tokens" tick={{ fill: '#78716c', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatTokens(v)} />
                <YAxis yAxisId="ratio" orientation="right" tick={{ fill: '#78716c', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
                <Tooltip content={<TooltipBox />} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
                <Line yAxisId="tokens" type="monotone" dataKey="cacheRead" stroke={C[5]} strokeWidth={2} dot={false} name="Cache Read" />
                <Line yAxisId="tokens" type="monotone" dataKey="input" stroke={C[0]} strokeWidth={2} dot={false} name="Input" />
              </LineChart>
            </ResponsiveContainer>
          </Panel>
        ) : null}
      </div>

      {/* Daily Detail Table */}
      <Panel title="Daily detail" subtitle="Recent 30 days of usage breakdown">
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] whitespace-nowrap">
            <thead>
              <tr className="border-b border-stone-200">
                <th className="text-left py-3 px-4 text-stone-400 font-semibold text-[10px]">Date</th>
                <th className="text-right py-3 px-4 text-stone-400 font-semibold text-[10px]">Input</th>
                <th className="text-right py-3 px-4 text-stone-400 font-semibold text-[10px]">Output</th>
                <th className="text-right py-3 px-4 text-stone-400 font-semibold text-[10px]">Cache read</th>
                <th className="text-right py-3 px-4 text-stone-600 font-semibold text-[10px]">Total tokens</th>
                <th className="text-right py-3 px-4 text-stone-400 font-semibold text-[10px]">Cost</th>
                <th className="text-left py-3 px-4 text-stone-400 font-semibold text-[10px]">Models</th>
              </tr>
            </thead>
            <tbody>
              {[...filteredDaily].reverse().slice(0, 30).map(d => (
                <tr key={d.date} className="border-b border-stone-100 hover:bg-stone-50/60 transition-colors">
                  <td className="py-2.5 px-4 text-stone-800 font-semibold">{formatDate(d.date)}</td>
                  <td className="py-2.5 px-4 text-right font-mono text-stone-500">{formatTokens(d.inputTokens)}</td>
                  <td className="py-2.5 px-4 text-right font-mono text-stone-500">{formatTokens(d.outputTokens)}</td>
                  <td className="py-2.5 px-4 text-right font-mono text-indigo-500/70">{formatTokens(d.cacheReadTokens)}</td>
                  <td className="py-2.5 px-4 text-right font-mono font-semibold text-indigo-600">{formatTokens(d.totalTokens)}</td>
                  <td className="py-2.5 px-4 text-right font-mono font-medium text-stone-600 bg-stone-50/40">{formatUSD(d.totalCost)}</td>
                  <td className="py-2.5 px-4text-stone-500 font-medium truncate max-w-[200px]">{d.modelsUsed.filter(m => !isSyntheticModel(m)).map(shortModelName).join(', ') || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
