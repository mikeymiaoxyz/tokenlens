import { describe, it, expect } from 'vitest';
import { normalizeUsageQuery } from '../../usage/query.js';

describe('normalizeUsageQuery', () => {
  it('defaults provider to all', () => {
    const result = normalizeUsageQuery({});
    expect(result.providers).toEqual(['all']);
  });

  it('converts comma-separated provider string to array', () => {
    const result = normalizeUsageQuery({ provider: 'claude,codex,cursor' });
    expect(result.providers).toEqual(['claude', 'codex', 'cursor']);
  });

  it('throws on invalid from date', () => {
    expect(() => normalizeUsageQuery({ from: 'not-a-date' })).toThrow('Invalid from date');
  });

  it('defaults daterange to last 30 days', () => {
    const result = normalizeUsageQuery({});
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

expect(result.from.getTime()).toBeCloseTo(thirtyDaysAgo.getTime(), -3);
    expect(result.to.getTime()).toBeCloseTo(now.getTime(), -3);
  });

  it('throws when from is after to', () => {
    expect(() => normalizeUsageQuery({ from: '2026-05-10', to: '2026-05-01' })).toThrow('from must be before to');
  });

  it('parses date-only from as local start of day', () => {
    const result = normalizeUsageQuery({from: '2026-05-11', to: '2026-05-11' });
    expect(result.from.getHours()).toBe(0);
    expect(result.from.getMinutes()).toBe(0);
    expect(result.from.getSeconds()).toBe(0);
    expect(result.from.getMilliseconds()).toBe(0);
  });

  it('parses date-only to as local end of day', () => {
    const result = normalizeUsageQuery({ from: '2026-05-11', to: '2026-05-11' });
    expect(result.to.getHours()).toBe(23);
    expect(result.to.getMinutes()).toBe(59);
    expect(result.to.getSeconds()).toBe(59);
    expect(result.to.getMilliseconds()).toBe(999);
  });

  it('treats same day from=to as valid full-day range', () => {
    expect(() => normalizeUsageQuery({ from: '2026-05-11', to: '2026-05-11' })).not.toThrow();
  });
});
