# TokenLens

**TokenLens** is a local AI coding token usage dashboard that monitors and visualizes token consumption, costs, and productivity metrics across multiple AI coding tools. All data stays local — no external telemetry or cloud dependencies.

![TokenLens Dashboard](docs/screenshots/dashboard.png)

---

## Features

### Multi-Provider Support

Tracks usage from 18 AI codingtools in a unified dashboard:
- **Claude Code / Claude Desktop** (`claude`)
- **OpenAI Codex** (`codex`)
- **GitHub Copilot** (`copilot`)
- **Cursor** (`cursor`, `cursor-agent`)
- **Google Gemini CLI** (`gemini`)
- **OpenClaw** (`openclaw`)
- **OpenCode** (`opencode`)
- **Kiro** (`kiro`)
- **Pi / OMP** (`pi`, `omp`)
- **Droid** (`droid`)
-**Roo Code** (`roo-code`)
- **Kilo Code** (`kilo-code`)
- **Qwen** (`qwen`)
- **Goose** (`goose`)
- **Antigravity** (`antigravity`)

### Usage Analytics

- **Token Tracking**— Input, output, cache read/write tokens with cost estimation
- **Cache Efficiency** — Cache hit rate visualization and estimated cost savings
- **Daily Trends** — Historical usage charts for 7D, 30D, 60D, and custom time ranges
- **ModelDistribution** — Pie charts showing which models are used most
- **Provider Comparison** — Switch between providers to compare usage patterns
- **Project Filtering** — Filter usage by specific projects
- **Code Change Trends** — Lines added/deleted from Edit andWrite operations
- **Tool Call Analytics** — Track which tools (Edit, Write, Bash, etc.) are used most
- **24-Hour Activity Heatmap** — Visualize activity patterns by hour of day

![24-Hour Activity Heatmap](docs/screenshots/heatmap.png)

### Local-First Design

- All data processed and stored locally on your machine
- Session files are parsed directly from provider directories (e.g., `~/.claude/projects/`)
- Disk caching in `~/.cache/tokenlens/` for fast subsequent loads
- No external services, no telemetry, no account required

---

## Requirements

- **Node.js >= 22**
- **npm** or **pnpm**

---

## Quick Start

### Installation

**Using npm (global install - recommended):**
```bash
npm install -g @mikeyxyz/tokenlens
tokenlens
```

**Using npx (no install required):**
```bash
npx @mikeyxyz/tokenlens
```

**Using pnpm:**
```bash
pnpm add -g @mikeyxyz/tokenlens
```

### Local Development

Start both the React frontend and Express API server:

```bash
npm run dev
```

This opens the dashboard at `http://localhost:5173` with API server at `http://localhost:3456`.

### Individual Servers

```bash
npm run dev:client  # Vite frontend only (port 5173)
npm run dev:server   # API server only (port 3456)
```

### Production Build

```bash
npm run build
npm start
```

### CLI Options

```bash
tokenlens --port 3456 --no-open  # Start on specific port without opening browser
tokenlens --version               # Show version
```

---

## Dashboard Overview

The main dashboard provides:

| Component | Description |
|-----------|-------------|
| **ProviderSwitcher** | Switch between AI providers (Claude Code, Codex, OpenClaw, More) |
| **KPI Cards** | Total tokens, Input/Output context, Cache hit rate, Cost |
| **Model Trend** | Stacked barchart of top 6 models over time |
| **Cache Efficiency** | Cost saved via caching, hit rate trend |
| **Code Change Trend** | Lines added/deleted/net from Edit/Write operations |
| **Tool Call Trend** | Frequency of tool usageover time |
| **24-Hour Heatmap** | Activity intensity by hour and day of week |
| **Model Distribution** | Pie chart of model usage share |
| **Project Distribution** | Bar chart of top projects by usage |
| **Daily Detail Table** | Day-by-day breakdown with tokens, cost, and models |

---

## API Reference

All API endpoints return responses wrapped in:

```typescript
{
  "data": T,           // Response payload
  "meta": {
    "generatedAt": string,// ISO timestamp
    "cached": boolean,        // Whether response was served from cache
    "warnings": Array<{ code: string, message: string }>
  }
}
```

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/providers` | Available providers with status and source counts |
| `GET` | `/api/summary` | Aggregated totals, by provider, by model, by project |
| `GET` | `/api/daily` | Daily usage trends with model/provider breakdowns |
| `GET` | `/api/projects` | Project-level usage breakdown |
| `GET` | `/api/models` | Model-level usage breakdown |
| `GET` | `/api/provider-usage` | Provider-level usage statistics |
|`GET` | `/api/analytics` | Code change trends, tool usage, productivity KPIs |
| `GET` | `/api/hourly-activity` | Hourly activity data for 24-hour heatmap |

### Query Parameters

Most endpoints support:

| Parameter | Type | Description |
|-----------|------|-------------|
| `provider` | `string` | Filter by provider (e.g., `claude`, `codex`) |
| `project` | `string` | Filter by project name |
| `from` | `ISO date` | Start date (default:30 days ago) |
| `to` | `ISO date` | End date (default: today) |

---

## Architecture

### Data Flow

```
Provider Session Files → Parser → Aggregator → Service Layer → API → Dashboard
     (local files)       (parse)   (group)    (cache)      (REST)   (React)
```

### Provider Discovery

Each provider implements a session discovery mechanism that locates session files/directories on the local machine:

- **Claude**: `~/.claude/projects/`
- **Cursor**: `~/.cursor/sessions/`
- **OpenClaw**: `~/.openclaw/sessions/`
- etc.

### Caching Strategy

1. **Memory Cache** — 60-second TTL for API responses
2. **Disk Cache** — `~/.cache/tokenlens/`for daily data persistence
3. **Cache Invalidation** — Automatic refresh when session files change (mtime-based)

---

## Project Structure

```
src/
├── cli/                    # CLI entry point (bin/tokenlens.js)
├── client/# React frontend
│   ├── api/               # API client functions (fetchDaily, fetchAnalytics, etc.)
│   ├── components/        # React components
│   │   ├── Dashboard.tsx  # Main dashboard
│   │   ├── AnalyticsSection.tsx
│   │   └── HeatmapSection.tsx
│   ├── hooks/             # Custom hooks (useCcusageData, useLocalStorageState)
│   └── utils/             # Formatters and utilities
├── providers/            # Provider implementations (18 providers)
│   ├── claude.ts
│   ├── codex.ts
│   ├── cursor.ts
│   └── ...               # Each provider parses its own session format
├── server/                # Express API server
│   ├── routes.ts          #API endpoint definitions
│   ├── analyticsService.ts
│   └── hourlyActivityService.ts
├── shared/                # Shared TypeScript types
├── usage/                 # Core service logic
│   ├── service.ts         # Main aggregation service
│   ├── query.ts# Query parameter handling
│   └── aggregate.ts
├── cache/                 # Memory and disk caching
├── parser.ts              # Session parsing logic
└── models.ts             # Model pricing and cost calculation
```

---

## Tech Stack

### Frontend
- **React19** — UI framework
- **Vite 6** — Build tool
- **Tailwind CSS 4** — Styling
- **Recharts 2** — Data visualization

### Backend
- **Express 5** — HTTP server
- **TypeScript**— Type safety throughout
- **tsx** — TypeScript execution in dev mode

### Testing
- **Vitest** — Unit testing
- **Playwright** — E2E testing

---

## Configuration

TokenLens requires no configuration files. Provider session directories are automatically discovered based oneach provider's known locations.

To add support for a new provider, implement the `Provider` interface in `src/providers/`:

```typescript
export type Provider = {
  name: string
  displayName: string
  modelDisplayName(model: string): string
  toolDisplayName(rawTool: string): string
  discoverSessions(): Promise<SessionSource[]>
  createSessionParser(source: SessionSource, seenKeys: Set<string>): SessionParser
}
```

---

## Acknowledgments

TokenLens is inspired by and builds upon two excellent open-source projects:

- **[tokendash](https://github.com/zhangferry/tokendash)** — The original token tracking dashboard that pioneered local AI usage monitoring. TokenLens draws heavily from tokendash's approach to session parsing, heatmap visualization, and provider architecture.
- **[codeburn](https://github.com/getagentseal/codeburn)** — A code analysis CLI tool that TokenLens adapts for parsing session data and extracting code change metrics.

We extend our thanks to the authors of these projects for their innovative work in the open-source community.

---

## License

MIT
