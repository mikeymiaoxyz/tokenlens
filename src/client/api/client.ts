import type {
  DailyResponse,
  MonthlyResponse,
  SessionResponse,
  ProjectsResponse,
  BlocksResponse,
  ApiResult,
  DailyUsageDTO,
  ProjectUsageDTO,
  AnalyticsResponse,
  DailyEntry,
  ProviderStatusDTO,
} from '../../shared/types';

export interface HourlyActivityEntry {
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

export interface HourlyActivityResponse {
  entries: HourlyActivityEntry[];
}

const BASE = '/api';

export type TimeRangeKey = 'today' | '7d' | '30d' | '60d' | 'all';

function timeRangeToDates(range: TimeRangeKey): { from?: string; to?: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const to = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;

  switch (range) {
    case 'today': {
      const from = to;
      return { from, to };
    }
    case '7d': {
      const d = new Date(now); d.setDate(d.getDate() - 7);
      const from = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
      return { from, to };
    }
    case '30d': {
      const d = new Date(now); d.setDate(d.getDate() - 30);
      const from = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
      return { from, to };
    }
    case '60d': {
      const d = new Date(now); d.setDate(d.getDate() - 60);
      const from = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
      return { from, to };
    }
    case 'all': {
      // Use Unix epoch as the earliest possible date for true ALL semantics
      return { from: '1970-01-01', to };
    }
  }
}

function qs(provider: string, extra?: Record<string, string | undefined>): string {
  const parts: string[] = [];
  if (provider !== 'all') parts.push('provider=' + encodeURIComponent(provider));
  if (extra) {
    for (const [key, val] of Object.entries(extra)) {
      if (val) parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(val));
    }
  }
  return parts.length > 0 ? '?' + parts.join('&') : '';
}

export async function fetchProviders(): Promise<ProviderStatusDTO[]> {
  const res = await fetch(BASE + '/providers');
  if (!res.ok) throw new Error('Failed to fetch providers: ' + res.status);
const json = await res.json() as ApiResult<ProviderStatusDTO[]>;
  return json.data;
}

export async function fetchDaily(provider = 'all', project?: string, range: TimeRangeKey = '30d'): Promise<DailyResponse> {
  const { from, to } =timeRangeToDates(range);
  const res = await fetch(BASE + '/daily' + qs(provider, { project: project || undefined, from, to }));
  if (!res.ok) throw new Error('Failed to fetch daily: ' + res.status);
  const json = await res.json() as ApiResult<DailyUsageDTO[]>;
  return {
    daily: json.data.map((d: DailyUsageDTO): DailyEntry => ({
      date: d.date,
      inputTokens: d.inputTokens,
      outputTokens: d.outputTokens,
      cacheCreationTokens: d.cacheWriteTokens,
      cacheReadTokens: d.cacheReadTokens,
      totalTokens: d.totalTokens,
      totalCost: d.totalCost,
      modelsUsed: d.models.map((m) => m.modelName),
      modelBreakdowns: d.models.map((m) => ({
        modelName:m.modelName,
        inputTokens: m.inputTokens,
        outputTokens: m.outputTokens,
        cacheCreationTokens: m.cacheWriteTokens,
        cacheReadTokens: m.cacheReadTokens,
        cost: m.totalCost,
      })),
    })),
    totals: {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalTokens: 0,
      totalCost: 0,
    },
  };
}

export async function fetchMonthly(provider = 'all'): Promise<MonthlyResponse> {
  return fetchDaily(provider);
}

export async function fetchSession(provider = 'all'): Promise<SessionResponse> {
  return fetchDaily(provider);
}

export async function fetchProjects(provider = 'all', range: TimeRangeKey = '30d'): Promise<ProjectsResponse> {
  const { from, to } = timeRangeToDates(range);
  const res = await fetch(BASE + '/projects' + qs(provider, { from, to }));
  if (!res.ok) throw new Error('Failed to fetch projects: ' + res.status);
  const json = await res.json() as ApiResult<ProjectUsageDTO[]>;
  const byProject: Record<string, DailyEntry[]> = {};
  for (const p of json.data) {
    byProject[p.projectPath] = [{
      date: '',
      inputTokens: p.inputTokens,
      outputTokens: p.outputTokens,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalTokens: p.totalTokens,
      totalCost: p.totalCost,
      modelsUsed: [],
      modelBreakdowns: [],
    }];
  }
  return { projects: byProject };
}

export async function fetchAnalytics(provider = 'all', project?: string, range: TimeRangeKey = '30d'): Promise<AnalyticsResponse> {
  const { from, to } = timeRangeToDates(range);
  const res = await fetch(BASE + '/analytics' + qs(provider, { project: project || undefined, from, to }));
  if (!res.ok) throw new Error('Failed to fetch analytics: ' + res.status);
  const json = await res.json() as ApiResult<AnalyticsResponse>;
  return json.data;
}

export async function fetchHourlyActivity(provider ='all', project?: string, range: TimeRangeKey = '30d'): Promise<HourlyActivityResponse> {
  const { from, to } = timeRangeToDates(range);
  const res = await fetch(BASE + '/hourly-activity' + qs(provider, { project:project || undefined, from, to }));
  if (!res.ok) throw new Error('Failed to fetch hourly activity: ' + res.status);
  const json = await res.json() as ApiResult<HourlyActivityResponse>;
  return json.data;
}

export async function fetchBlocks(_provider ='all', _project = ''): Promise<BlocksResponse> {
  return { blocks: [] };
}
