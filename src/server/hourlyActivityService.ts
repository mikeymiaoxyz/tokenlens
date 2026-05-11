import type { UsageQuery } from '../usage/query.js';
import { parseAllSessions } from'../parser.js';
import type { ProjectSummary } from '../types.js';
import { applyProjectFilter } from '../usage/projectFilter.js';

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

function getDateHourKey(timestamp: string): { date: string; hour: number } {
  // Handle ISO timestamps without timezone (treat as local time)
  const d= new Date(timestamp.includes('T') ? timestamp : `${timestamp}T00:00:00`);
  return {
    date: `${d.getFullYear()}-${String(d.getMonth()+ 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    hour: d.getHours(),
  };
}

function toDateRange(query:UsageQuery) {
  return {start: query.from, end: query.to };
}


export async function getHourlyActivity(query: UsageQuery): Promise<HourlyActivityResponse> {
  const dateRange = toDateRange(query);
  const projects:ProjectSummary[] = [];

  if (query.providers.includes('all')) {
    projects.push(...await parseAllSessions(dateRange, undefined));
  } else {
    for (const provider of query.providers) {
      projects.push(...await parseAllSessions(dateRange,provider));
    }
  }

  const filteredProjects = applyProjectFilter(projects, query.project);

  const hourMap = new Map<string, HourlyActivityEntry>();

  for (const project of filteredProjects) {
    for (const session of project.sessions) {
      for (const turn of session.turns) {
        for (const call of turn.assistantCalls) {
          const { date, hour } = getDateHourKey(call.timestamp);
          const key = `${date}-${hour}`;

          if (!hourMap.has(key)) {
            hourMap.set(key, {
              date,
hour,
              inputTokens: 0,
              outputTokens: 0,
              cacheReadTokens: 0,
              cacheWriteTokens: 0,
              totalTokens: 0,
              totalCost: 0,
              calls: 0,
            });
          }

const entry = hourMap.get(key)!;
          entry.inputTokens += call.usage.inputTokens;
          entry.outputTokens += call.usage.outputTokens;
          entry.cacheReadTokens += call.usage.cacheReadInputTokens;
          entry.cacheWriteTokens += call.usage.cacheCreationInputTokens;
          entry.totalTokens += call.usage.inputTokens + call.usage.outputTokens;
          entry.totalCost += call.costUSD;
          entry.calls += 1;
        }
      }
    }
  }

  const entries= Array.from(hourMap.values()).sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    return dateCompare !== 0 ? dateCompare : a.hour -b.hour;
  });

  return { entries };
}
