export interface UsageQuery {
  providers: string[]
  project: string | null
  from: Date
  to: Date
}

export function normalizeUsageQuery(input: Record<string, unknown>): UsageQuery {
  const rawProvider = typeof input['provider'] === 'string' ? input['provider'] : 'all'
  const providers = rawProvider === 'all'
    ? ['all']
    : rawProvider.split(',').map(item => item.trim()).filter(Boolean)

  const project = typeof input['project'] === 'string' && input['project'].trim()
    ? input['project'].trim()
    : null

  const now = new Date()
  const defaultFrom = new Date(now)
  defaultFrom.setDate(defaultFrom.getDate() - 30)

  const from = parseDate(input['from'], defaultFrom, 'from')
  const to = parseDate(input['to'], now, 'to')

  if(from.getTime() > to.getTime()) {
    throw new Error('from must be before to')
  }

  return { providers, project, from, to }
}

function parseDate(value: unknown, fallback: Date, field: string): Date {
  if (typeof value!== 'string' || value.trim() === '') return fallback

  const trimmed = value.trim()

  // Date-only format (YYYY-MM-DD): construct explicitly in local time
  // to avoid UTC-offsetissues with new Date() parsing.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split('-').map(Number)
if (field === 'to') {
      // End of local day so the entire day is included.
      return new Date(year, month - 1, day, 23, 59, 59, 999)
    } else {
      // Start of local day (00:00:00.000 local time).
      return new Date(year, month - 1, day, 0, 0, 0, 0)
    }
  }

  // Non-date-only: use standard Date parsing.
  const parsed =new Date(value as string)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ${field} date`)
  }
  return parsed
}
