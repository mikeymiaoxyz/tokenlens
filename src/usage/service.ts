import type { UsageQuery } from './query.js';
import type {
  SummaryDTO,
DailyUsageDTO,
  ProjectUsageDTO,
  ModelUsageDTO,
  ProviderUsageDTO,
} from '../shared/types.js';
import { applyProjectFilter } from './projectFilter.js';
import { listProviderStatus } from './providerService.js';
import { parseAllSessions } from '../parser.js';
import { aggregateProjectsByProvider } from './aggregate.js';
import type { ProjectSummary } from '../types.js';
import { MemoryCache } from '../cache/memory.js';
import { readJsonCache, writeJsonCache } from '../cache/disk.js';

const memoryCache = new MemoryCache<string>(60 * 1000);

function toDateRange(query: UsageQuery) {
  return { start: query.from, end: query.to };
}

function cacheKey(query: UsageQuery, suffix: string): string {
  return `${query.providers.join(',')}-${query.project ?? ''}-${query.from.toISOString()}-${query.to.toISOString()}-${suffix}`;
}

function diskCacheKey(query: UsageQuery, suffix: string): string {
  const raw = `${suffix}-${query.providers.join('_')}-${query.project ?? 'all'}-${query.from.toISOString()}-${query.to.toISOString()}`;
  return raw.replace(/[^a-zA-Z0-9_.-]/g, '_');
}


async function loadProjects(query: UsageQuery): Promise<ProjectSummary[]> {
  const dateRange = toDateRange(query);
  let rawProjects: ProjectSummary[];
  if (query.providers.includes('all')) {
    rawProjects = await parseAllSessions(dateRange, undefined);
  } else {
    const groups = await Promise.all(
      query.providers.map(provider => parseAllSessions(dateRange, provider)),
    );
    rawProjects = groups.flat();
  }
  return applyProjectFilter(rawProjects, query.project);
}

// Internal accumulator types (separate from DTOs to avoid Map type conflicts)
interface InternalModelAcc {
  modelName: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  totalCost: number;
  calls: number;
  reasoningTokens: number;
  estimatedCost: boolean;
}

interface InternalProviderAcc {
  provider: string;
  displayName: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  totalCost: number;
  calls: number;
  sessions: Set<string>;
  projects: Set<string>;
}

interface InternalDayAcc {
  date: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  totalCost: number;
  calls: number;
  sessions: Set<string>;
  models: Map<string, InternalModelAcc>;
  providers: Map<string, InternalProviderAcc>;
}

function projectsToDailyDTO(projects: ProjectSummary[]): DailyUsageDTO[] {
  const dayMap = new Map<string, InternalDayAcc>();

  const ensureDay = (date: string): InternalDayAcc => {
    if (!dayMap.has(date)) {
      dayMap.set(date, {
date,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalTokens: 0,
        totalCost: 0,
        calls: 0,
        sessions: new Set(),
        models: new Map(),
        providers: new Map(),
      });
    }
    return dayMap.get(date)!;
  };

  for (const project of projects) {
    for (const session of project.sessions) {
      const sessionDate = session.firstTimestamp.slice(0, 10);
const day = ensureDay(sessionDate);
      day.sessions.add(session.sessionId);

      for (const turn of session.turns) {
        for (const call of turn.assistantCalls) {
          const callDate = call.timestamp.slice(0, 10);
          const callDay =ensureDay(callDate);

          callDay.inputTokens += call.usage.inputTokens;
          callDay.outputTokens += call.usage.outputTokens;
          callDay.cacheReadTokens += call.usage.cacheReadInputTokens;
          callDay.cacheWriteTokens += call.usage.cacheCreationInputTokens;
callDay.totalTokens += call.usage.inputTokens + call.usage.outputTokens;
          callDay.totalCost += call.costUSD;
          callDay.calls += 1;

          // Model breakdown
          let model = callDay.models.get(call.model);
          if (!model) {
            model = {
              modelName: call.model,
              provider: call.provider,
              inputTokens: 0,
              outputTokens: 0,
              cacheReadTokens: 0,
              cacheWriteTokens: 0,
              totalTokens:0,
              totalCost: 0,
              calls: 0,
            reasoningTokens: 0,
            estimatedCost: false,
          };
          callDay.models.set(call.model, model);
          }
          model.inputTokens += call.usage.inputTokens;
          model.outputTokens += call.usage.outputTokens;
          model.cacheReadTokens += call.usage.cacheReadInputTokens;
          model.cacheWriteTokens += call.usage.cacheCreationInputTokens;
          model.totalTokens += call.usage.inputTokens + call.usage.outputTokens;
          model.totalCost += call.costUSD;
          model.calls += 1;

          // Provider breakdown
let prov = callDay.providers.get(call.provider);
          if (!prov) {
            prov = {
              provider: call.provider,
              displayName: call.provider,
              inputTokens: 0,
              outputTokens: 0,
              totalTokens: 0,
              totalCost:0,
              calls: 0,
              sessions: new Set(),
              projects: new Set(),
            };
            callDay.providers.set(call.provider, prov);
          }
          prov.inputTokens += call.usage.inputTokens;
          prov.outputTokens += call.usage.outputTokens;
          prov.totalTokens += call.usage.inputTokens + call.usage.outputTokens;
          prov.totalCost += call.costUSD;
          prov.calls += 1;
          prov.sessions.add(session.sessionId);
          prov.projects.add(project.project);
        }
      }
    }
  }

  return Array.from(dayMap.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(day => ({
      date: day.date,
      inputTokens: day.inputTokens,
      outputTokens: day.outputTokens,
      cacheReadTokens: day.cacheReadTokens,
      cacheWriteTokens: day.cacheWriteTokens,
      reasoningTokens: 0,
      totalTokens: day.totalTokens,
      totalCost: day.totalCost,
      estimatedCost: false,
      calls: day.calls,
      sessions: day.sessions.size,
            models: [...day.models.values()].filter(m => m.modelName !== 'synthetic' && m.modelName !== '<synthetic>'),
      providers: [...day.providers.values()].map(p => ({
        provider: p.provider,
        displayName: p.displayName,
        inputTokens: p.inputTokens,
        outputTokens: p.outputTokens,
        totalTokens: p.totalTokens,
        totalCost:p.totalCost,
        estimatedCost: false,
        calls: p.calls,
        sessions: p.sessions.size,
        projects: p.projects.size,
      })),
    }));
}

function projectsToSummary(projects: ProjectSummary[]) {
  const totals = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    totalCost: 0,
    estimatedCost: false,
    calls: 0,
    sessions:new Set<string>(),
    activeDays: new Set<string>(),
  };

  const providerMap = new Map<string, ProviderUsageDTO>();
  const modelMap = new Map<string, ModelUsageDTO>();
  const projectMap = new Map<string, ProjectUsageDTO>();

  for (const project of projects) {
    for (const session of project.sessions) {
      totals.sessions.add(session.sessionId);
      totals.activeDays.add(session.firstTimestamp.split('T')[0] ?? session.firstTimestamp.slice(0, 10));

      for (const turn of session.turns) {
for (const call of turn.assistantCalls) {
          totals.inputTokens += call.usage.inputTokens;
          totals.outputTokens += call.usage.outputTokens;
          totals.cacheReadTokens += call.usage.cacheReadInputTokens;
          totals.cacheWriteTokens += call.usage.cacheCreationInputTokens;
          totals.totalTokens += call.usage.inputTokens + call.usage.outputTokens;
          totals.totalCost += call.costUSD;
          totals.calls += 1;

          const existing = providerMap.get(call.provider) ?? {
            provider: call.provider,
            displayName: call.provider,
inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            totalCost: 0,
            estimatedCost: false,
            calls: 0,
            sessions: 0,
            projects: 0,
          };
          existing.inputTokens += call.usage.inputTokens;
          existing.outputTokens += call.usage.outputTokens;
          existing.totalTokens += call.usage.inputTokens + call.usage.outputTokens;
          existing.totalCost += call.costUSD;
          existing.calls += 1;
          providerMap.set(call.provider, existing);

const modelKey = `${call.model}-${call.provider}`;
          const existingModel = modelMap.get(modelKey) ?? {
            modelName: call.model,
            provider: call.provider,
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
cacheWriteTokens: 0,
            reasoningTokens: 0,
            totalTokens: 0,
            totalCost: 0,
            estimatedCost: false,
            calls: 0,
          };
          existingModel.inputTokens += call.usage.inputTokens;
          existingModel.outputTokens+= call.usage.outputTokens;
          existingModel.cacheReadTokens += call.usage.cacheReadInputTokens;
          existingModel.cacheWriteTokens += call.usage.cacheCreationInputTokens;
          existingModel.totalTokens += call.usage.inputTokens + call.usage.outputTokens;
          existingModel.totalCost+= call.costUSD;
          existingModel.calls += 1;
          modelMap.set(modelKey, existingModel);
        }
      }

      const existingProject = projectMap.get(project.project) ?? {
        project: project.project,
        projectPath: project.projectPath,
        providers: [],
inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        totalCost: 0,
        estimatedCost: false,
        calls: 0,
        sessions: 0,
      };
      existingProject.inputTokens += session.totalInputTokens;
      existingProject.outputTokens += session.totalOutputTokens;
      existingProject.totalTokens += session.totalInputTokens + session.totalOutputTokens;
      existingProject.totalCost += session.totalCostUSD;
      existingProject.calls += session.apiCalls;
      existingProject.sessions += 1;
      const firstProvider = session.turns[0]?.assistantCalls[0]?.provider ?? '';
      if (firstProvider && !existingProject.providers.includes(firstProvider)) {
        existingProject.providers.push(firstProvider);
      }
      projectMap.set(project.project, existingProject);
    }
  }

  const providerSessions = new Map<string, Set<string>>();
  for (const project of projects) {
    for (const session of project.sessions) {
      for (const turn of session.turns) {
        for (const call of turn.assistantCalls) {
          const existing = providerSessions.get(call.provider) ?? new Set();
          existing.add(session.sessionId);
          providerSessions.set(call.provider, existing);
        }
      }
    }
  }
  for (const [provider, sessions] of providerSessions) {
    const existing = providerMap.get(provider);
    if (existing) existing.sessions = sessions.size;
  }

  const providerProjects = new Map<string, Set<string>>();
  for (const project of projects) {
    for (const session of project.sessions) {
      for (const turn of session.turns) {
        for (const call of turn.assistantCalls) {
          const existing = providerProjects.get(call.provider) ?? new Set();
          existing.add(project.project);
          providerProjects.set(call.provider, existing);
        }
      }
    }
  }
  for (const [provider, projSet] of providerProjects) {
    const existing = providerMap.get(provider);
    if (existing) existing.projects = projSet.size;
  }

  return {
    totals: {
      ...totals,
      sessions: totals.sessions.size,
      activeDays: totals.activeDays.size,
    },
    providers: [...providerMap.values()],
    models: [...modelMap.values()].filter(m => m.modelName !== 'synthetic' && m.modelName !== '<synthetic>'),
    projects: [...projectMap.values()],
  };
}

export async function getProviderStatuses() {
  return listProviderStatus();
}

export async function getSummary(query: UsageQuery): Promise<SummaryDTO> {
  const key = cacheKey(query, 'summary');
  const cached = memoryCache.get(key);
  if (cached) {
    return JSON.parse(cached) as SummaryDTO;
  }

  const projects = await loadProjects(query);
  const result = projectsToSummary(projects);

  memoryCache.set(key, JSON.stringify(result));
  return result;
}

export async function getDaily(query: UsageQuery): Promise<DailyUsageDTO[]> {
  const key = cacheKey(query, 'daily');
  const cached = memoryCache.get(key);
  if (cached) {
    return JSON.parse(cached) as DailyUsageDTO[];
  }

  const dk = diskCacheKey(query, 'daily');
  const diskCached = await readJsonCache<DailyUsageDTO[]>(dk, 2);
  if (diskCached) {
    memoryCache.set(key, JSON.stringify(diskCached));
    return diskCached;
  }

  const projects = await loadProjects(query);
  const result = projectsToDailyDTO(projects);

  memoryCache.set(key, JSON.stringify(result));
  await writeJsonCache(dk, 2, result);
  return result;
}

export async function getProjects(query: UsageQuery): Promise<ProjectUsageDTO[]> {
  const summary = await getSummary(query);
  return summary.projects;
}

export async function getModels(query: UsageQuery): Promise<ModelUsageDTO[]> {
  const summary = await getSummary(query);
  return summary.models;
}

export async function getProviderUsage(query: UsageQuery): Promise<ProviderUsageDTO[]> {
  const key = cacheKey(query, 'provider-usage');
  const cached = memoryCache.get(key);
  if (cached) {
    return JSON.parse(cached) as ProviderUsageDTO[];
  }

const projects = await loadProjects(query);
  const result = aggregateProjectsByProvider(projects) as ProviderUsageDTO[];

  memoryCache.set(key, JSON.stringify(result));
  return result;
}
