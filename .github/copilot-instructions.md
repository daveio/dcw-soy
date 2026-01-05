# AGENTS.md

> Documentation for AI agents working in this repository.

## Project Overview

`dcw-soy` is a Cloudflare Workers application that serves `dcw.soy`, an animated soy sauce bottle website with a redirect system. It validates shortlinks against `dave.io/api/redirects` and either redirects to `dave.io/go/{path}` or serves a 404 page.

## Quick Reference

| Task             | Command                  |
| ---------------- | ------------------------ |
| Install deps     | `bun install`            |
| Dev server       | `bun run dev`            |
| Run tests        | `bun run test`           |
| Lint all         | `bun run lint`           |
| Fix lint         | `bun run lint:fix`       |
| Format           | `bun run lint:format`    |
| Type check       | `bun run lint:types`     |
| Deploy (prod)    | `bun run deploy`         |
| Deploy (nonprod) | `bun run deploy:nonprod` |
| Generate types   | `bun run cf-typegen`     |

## Technology Stack

- **Runtime**: Cloudflare Workers
- **Package Manager**: Bun 1.3.5
- **Language**: TypeScript (strict mode, ES2021 target)
- **Testing**: Vitest with `@cloudflare/vitest-pool-workers`
- **Linting**: Biome + Trunk (multi-tool orchestrator)
- **Formatting**: Prettier + Biome
- **Version Management**: mise (`mise.toml`)

## Project Structure

```
src/
├── index.ts          # Main worker: fetch handler, redirect logic, KV caching
└── index.test.ts     # Vitest tests with mocked KV and ASSETS

public/
├── index.html        # Animated soy bottle site (bouncing, sparkles, food emojis)
├── not-found.html    # 404 page for invalid redirects
├── soy.webp          # Soy sauce bottle image
└── duck.webp         # Used by dave.io integration tests

wrangler.jsonc        # Cloudflare Workers config (KV bindings, assets)
worker-configuration.d.ts  # Auto-generated types from `bun run cf-typegen`
```

## Architecture

### Request Flow

1. **Root path (`/`)** → Serve static site from `public/`
2. **Static assets** → Serve directly via `env.ASSETS.fetch()`
3. **Other paths** → Redirect validation:
   - Fetch valid redirects from KV cache (or `dave.io/api/redirects`)
   - If path is valid → 301 redirect to `https://dave.io/go/{path}`
   - If invalid → Serve `not-found.html` with 404 status
   - If validation fails → Redirect anyway (fallback behavior)

### KV Caching Strategy

- **Key**: `redirects` (stores `RedirectCache` with `redirects[]` and `lastUpdated`)
- **Lock Key**: `redirects-lock` (prevents concurrent cache refreshes)
- **TTL**: 1 hour (`CACHE_TTL = 3600`)
- **Lock TTL**: 5 minutes (`REFRESH_LOCK_TTL = 300`)
- Background refresh uses `ctx.waitUntil()` for non-blocking updates

### Cloudflare Bindings

```typescript
interface Env {
  KV: KVNamespace; // Redirect cache storage
  ASSETS: Fetcher; // Static asset serving from public/
}
```

## Code Patterns

### Worker Export Pattern

```typescript
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // ...
  },
} satisfies ExportedHandler<Env>;
```

### Response Patterns

- **Redirect**: `Response.redirect(url, 301)`
- **404 with custom body**: Create new `Response` with body from asset, status 404, strip `Location` header

### Test Patterns

Tests use manual mocks for `env` (no `@cloudflare/vitest-pool-workers` CLOUDFLARE_MOCKS):

```typescript
function createMockEnv(assetMap: AssetMap = {}) {
  const store = new Map<string, unknown>()
  return {
    env: { ASSETS: { fetch: createAssetsFetch(assetMap) }, KV: { get, put, delete } },
    kvStore: store,
    assetsFetch: vi.fn()
  }
}
```

Global fetch is mocked for external API calls:

```typescript
globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({...})))
```

## Type Generation

After modifying `wrangler.jsonc` (adding KV namespaces, bindings, etc.):

```bash
bun run cf-typegen  # Regenerates worker-configuration.d.ts
```

This file is auto-generated and should not be manually edited. It provides the `Env` interface.

## Linting Details

### Biome

- Config: `biome.json` (extends `.trunk/configs/biome.json`)
- Includes: `src/**`, `static/**`, `wrangler.jsonc`, `package.json`, `AGENTS.md`

### Trunk

- Config: `.trunk/trunk.yaml`
- Enabled linters: `biome`, `markdownlint`, `prettier`, `yamllint`, `actionlint`, `checkov`, `osv-scanner`, `trufflehog`, `taplo`
- Prettier ignores: `*.css`, `*.js`, `*.json`, `*.ts` (Biome handles these)
- Ignored files: `worker-configuration.d.ts`, `wrangler.jsonc`

### Pre-commit Hooks

Trunk runs `bun install` and formatting on pre-commit via `.trunk/trunk.yaml` actions.

## Testing

```bash
bun run test        # Run all tests once
bun run vitest      # Watch mode (if needed)
```

- Test file location: `src/**/*.test.ts`
- Environment: `node` (not `edge` or `miniflare`)
- Tests mock `Env` manually; no special vitest pool configuration needed for these tests

## CI/CD

### GitHub Actions (`.github/workflows/ci.yaml`)

```yaml
runs-on: ubuntu-24.04
steps:
  - bun install --frozen-lockfile
  - bun run test
```

## Gotchas

1. **Type regeneration**: Run `bun run cf-typegen` after changing `wrangler.jsonc` bindings
2. **Postinstall hook**: `bun install` automatically runs `cf-typegen` and `lint:format`
3. **No vitest pool workers**: Tests don't use `@cloudflare/vitest-pool-workers` pool; manual mocking is used
4. **Fallback redirect**: If redirect validation fails (API down, KV error), the worker redirects anyway rather than blocking
5. **Lock mechanism**: Cache refresh uses a simple KV lock to prevent thundering herd on cache miss

## External Dependencies

- **dave.io/api/redirects**: Source of truth for valid redirect paths
- **dave.io/go/{path}**: Redirect destination

## Local Development

```bash
# Full setup
bun install
bun run dev         # Starts wrangler dev server

# Typical workflow
bun run dev         # Local testing
bun run test        # Run tests
bun run lint:fix    # Fix lint issues
bun run deploy      # Deploy to production
```
