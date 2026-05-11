import type { ProjectSummary } from '../types.js';

export function applyProjectFilter(
  projects: ProjectSummary[],
  project: string | null,
): ProjectSummary[] {
  if (!project) return projects;
  const keyword = project.toLowerCase();
  return projects.filter(item =>
    item.project.toLowerCase() === keyword ||
    item.projectPath.toLowerCase() === keyword ||
    item.project.toLowerCase().includes(keyword) ||
    item.projectPath.toLowerCase().includes(keyword),
  );
}
