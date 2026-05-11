import type { AnalyticsResponse, DailyCodeChange, ToolUsageEntry, DailyToolCall, ProductivityKPIs } from '../shared/types.js';
import type { UsageQuery } from '../usage/query.js';
import { parseAllSessions } from '../parser.js';
import type { ProjectSummary } from '../types.js';
import { listProviderStatus } from '../usage/providerService.js';
import { applyProjectFilter } from '../usage/projectFilter.js';

const SUPPORTED_ANALYTICS_PROVIDERS = new Set(['claude', 'openclaw']);

function getDateKey(timestamp: string): string {
  return timestamp.slice(0, 10);
}

function toDateRange(query: UsageQuery) {
  return { start: query.from, end: query.to };
}


export async function getAnalytics(query: UsageQuery): Promise<AnalyticsResponse> {
  const statuses = await listProviderStatus();
  const providerStatus =statuses.find(p => p.name === query.providers[0]);

  if (!providerStatus || !SUPPORTED_ANALYTICS_PROVIDERS.has(query.providers[0])) {
    return {
      codeChangeTrend: [],
      toolUsageDistribution: [],
      productivityKPIs:{
        avgLinesPerEdit: 0,
        filesModifiedPerDay: 0,
        addDeleteRatio: 0,
        totalEdits: 0,
        totalFilesModified: 0,
        activeDaysWithEdits: 0,
      },
toolCallTrend: [],
    };
  }

  const dateRange = toDateRange(query);
  const projects: ProjectSummary[] = [];

  if (query.providers.includes('all')) {
    projects.push(...await parseAllSessions(dateRange,undefined));
  } else {
    for (const provider of query.providers) {
      projects.push(...await parseAllSessions(dateRange,provider));
    }
  }

  // Apply project filter
  const filteredProjects = applyProjectFilter(projects, query.project);

  // Aggregate code changes
  const changeMap = new Map<string, { added: number; deleted: number; files: Set<string> }>();
  const toolCountMap = new Map<string, number>();
  const trendMap = new Map<string, Map<string, number>>();

  for (const project of filteredProjects) {
    for (const session of project.sessions) {
      for (const turn of session.turns) {
        for (const call of turn.assistantCalls) {
          const date = getDateKey(call.timestamp);

          // Track toolusage
          for (const tool of call.tools) {
            toolCountMap.set(tool, (toolCountMap.get(tool) || 0) + 1);

            // Toolcall trend
            if (!trendMap.has(date)) trendMap.set(date, new Map());
            const dayTools = trendMap.get(date)!;
            dayTools.set(tool, (dayTools.get(tool) || 0) + 1);
          }

          // Trackcode changes (Edit/Write operations)
          if (call.linesAdded > 0 || call.linesDeleted > 0) {
            if (!changeMap.has(date)) {
              changeMap.set(date, { added:0, deleted: 0, files: new Set() });
            }
            const entry = changeMap.get(date)!;
            entry.added += call.linesAdded;
            entry.deleted += call.linesDeleted;
          }
        }
      }
    }
  }

  // Build code changetrend
  const codeChangeTrend: DailyCodeChange[] = [];
  for (const [date, { added, deleted, files }] of changeMap) {
    codeChangeTrend.push({
      date,
      linesAdded: added,
      linesDeleted: deleted,
      netChange: added - deleted,
      filesModified: files.size,
    });
  }
  codeChangeTrend.sort((a, b) => a.date.localeCompare(b.date));

  // Build tool usage distribution
  const toolUsageDistribution: ToolUsageEntry[] = [...toolCountMap.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  // Build tool call trend
  const toolCallTrend: DailyToolCall[] = [];
  for (const [date, dayTools] of trendMap) {
    const entry: DailyToolCall = { date };
    for (const [tool, count] of dayTools) {
      entry[tool] = count;
    }
    toolCallTrend.push(entry);
  }
  toolCallTrend.sort((a, b) => a.date.localeCompare(b.date));

  // Calculate productivity KPIs
  const editCalls = filteredProjects.flatMap(p =>
    p.sessions.flatMap(s=>
      s.turns.flatMap(t =>
        t.assistantCalls.filter(c => c.tools.includes('Edit') || c.tools.includes('Write'))
      )
    )
  );

  const totalEdits = editCalls.length;
  const totalLinesChanged = editCalls.reduce((s, c) => s + c.linesAdded + c.linesDeleted, 0);
  const totalLinesAdded = editCalls.reduce((s, c) => s + c.linesAdded, 0);
  const totalLinesDeleted= editCalls.reduce((s, c) => s + c.linesDeleted, 0);
  const editDates = new Set(editCalls.map(c => getDateKey(c.timestamp)));

  const productivityKPIs: ProductivityKPIs = {
    avgLinesPerEdit: totalEdits > 0 ? Math.round(totalLinesChanged / totalEdits) : 0,
    filesModifiedPerDay: 0,
    addDeleteRatio: totalLinesDeleted > 0 ? Math.round((totalLinesAdded / totalLinesDeleted) * 100) / 100 : totalLinesAdded > 0 ? 1 : 0,
    totalEdits,
    totalFilesModified: 0,
    activeDaysWithEdits: editDates.size,
  };

  return {
codeChangeTrend,
    toolUsageDistribution,
    productivityKPIs,
    toolCallTrend,
  };
}
