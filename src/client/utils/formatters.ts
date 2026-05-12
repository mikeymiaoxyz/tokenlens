export function formatTokens(n: number): string {
  if (n >= 1_000_000) {
    return (n / 1_000_000).toFixed(1) + 'M';
  }
  if (n >= 1_000) {
    return (n / 1_000).toFixed(0) + 'K';
  }
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export function formatUSD(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export function formatPercent(n: number): string {
  return n.toFixed(1) + '%';
}

export function formatProjectName(project: string): string {
  if (!project) return '';
  // 直接返回完整项目名，不做分割处理
  return project;
}
