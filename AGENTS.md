# AGENTS.md

> **Auto-generated guide for AI agents working in this repository.**

## Project Overview

**dcw-soy** is a Cloudflare Worker service built with TypeScript. It acts as a redirect handler and static site server.

- **Primary Function**: Serves static assets from `public/` and handles URL redirects by checking against a list fetched from `dave.io`.
- **Runtime**: Cloudflare Workers.
- **Package Manager**: [Bun](https://bun.sh/).
- **Testing**: Vitest with `@cloudflare/vitest-pool-workers`.
- **Tooling**: Biome, Trunk, Prettier.

## Environment & Setup

- **Tool Management**: Uses [mise](https://mise.jdx.dev/) for managing `bun` and `node` versions.
- **Configuration**:
  - `wrangler.jsonc`: Main Cloudflare Worker config.
  - `mise.toml`: Tool version definitions.
  - `package.json`: Scripts and dependencies.
  - `vitest.config.ts`: Test configuration.

## Essential Commands

Always use `bun run` for scripts.

| Task           | Command               | Description                                     |
| -------------- | --------------------- | ----------------------------------------------- |
| **Develop**    | `bun run dev`         | Starts local development server using Wrangler. |
| **Test**       | `bun run test`        | Runs unit tests with Vitest.                    |
| **Lint**       | `bun run lint`        | Runs Biome, Trunk, and Type checks.             |
| **Format**     | `bun run lint:format` | Formats code using Prettier, Biome, and Trunk.  |
| **Type Check** | `bun run lint:types`  | Runs `tsc --noEmit`.                            |
| **Deploy**     | `bun run deploy`      | Deploys to Cloudflare Workers (production).     |

## Code Architecture

### `src/index.ts`

The entry point for the worker.

- **`fetch` handler**:
  1. Checks if request is for root (`/`) -> serves from `env.ASSETS`.
  2. Checks if request matches a static asset -> serves from `env.ASSETS`.
  3. Calls `handleRedirect` for all other paths.
- **`handleRedirect`**:
  - Checks KV cache for valid redirects.
  - If cache miss, fetches from `https://dave.io/api/redirects`.
  - If match found, 301 redirects to `https://dave.io/go/{path}`.
  - If no match, serves `not-found.html` with 404 status.

### Caching Strategy

- **KV Storage**: Stores redirect lists in a KV namespace (binding: `KV`).
- **Keys**:
  - `redirects`: The cached list of redirects.
  - `redirects-lock`: A lock key to prevent multiple concurrent refreshes.
- **Refresh Logic**:
  - Cache TTL: 1 hour.
  - Asynchronous background refresh using `ctx.waitUntil`.

### `src/index.test.ts`

Contains unit tests mocking the Worker environment (`Env`, `KV`, `ASSETS`, `ExecutionContext`).

### `/stats` Analytics Dashboard

A browser-based dashboard at `/stats` backed by Worker API endpoints that query Analytics Engine via the SQL API. The browser never touches the Cloudflare API directly.

- **Dashboard page**: `public/stats/index.html` — single HTML file with Chart.js, dark theme, auto-refresh every 60s.
- **API routing**: `/stats/api/*` routes are handled in the `fetch` handler _before_ the static asset check, so they don't fall through to the redirect handler.
- **No analytics pollution**: Stats API requests do not write `writeDataPoint` events — they're internal dashboard calls.

#### Stats API Endpoints

| Endpoint               | Query                                   | Purpose                                                            |
| ---------------------- | --------------------------------------- | ------------------------------------------------------------------ |
| `/stats/api/overview`  | Summary totals (last 24h)               | Overview cards: total requests, redirects, 404s, avg response time |
| `/stats/api/traffic`   | Hourly buckets by event type (last 24h) | Stacked line chart of traffic over time                            |
| `/stats/api/paths`     | Top 20 paths by hits (last 24h)         | Paths table + event type doughnut chart                            |
| `/stats/api/countries` | Top 15 countries (last 24h)             | Countries table                                                    |
| `/stats/api/cache`     | Cache hit/miss counts (last 24h)        | Cache performance doughnut chart                                   |

#### Secrets Store Bindings

Both `ANALYTICS_API_TOKEN` and `ACCOUNT_ID` are stored in Secrets Store and fetched at runtime via `await env.BINDING.get()`. They share the same store and are configured in `wrangler.jsonc` under `secrets_store_secrets`.

## Conventions & Patterns

- **Formatting**: Strict usage of Biome and Prettier. Always run `bun run lint:format` after changes.
- **Imports**: Use ES modules (`import`/`export`).
- **Types**: Define interfaces for KV structures and API responses.
- **Error Handling**: Fail gracefully. If redirect fetch fails or returns invalid data, the worker attempts to redirect anyway (optimistic fallback).
- **User Agent**: The worker identifies itself as "THERE IS NO USER AGENT. THERE IS ONLY SOY." when fetching upstream data.

## Gotchas

- **Asset Binding**: The worker relies on `env.ASSETS` (Cloudflare Pages/Workers Assets) to serve static files. Tests mock this behavior.
- **KV Mocking**: Tests use a `Map`-based mock for KV storage.
- **Locking**: Be aware of the `refreshCacheWithLock` mechanism when modifying cache logic.
- **Redirect Fallback**: If `getValidRedirects` returns `null` (error state), the code defaults to redirecting to `dave.io` assuming the path might handle it there.
