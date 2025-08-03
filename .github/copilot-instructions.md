# `.github/copilot-instructions.md`

This file provides guidance to Claude Code (<https://claude.ai/code>) and other AI agents when working with code in this repository.

## File Locations

This codebase has documentation for AI agents.

- The authoritative file is `.github/copilot-instructions.md`.
  - There are two symlinks to this file:
    - `AGENTS.md`
    - `CLAUDE.md`
  - All edits should be made to `.github/copilot-instructions.md`.
    - Edits to `.github/copilot-instructions.md` will automatically be reflected in `AGENTS.md` and `CLAUDE.md`.

## Project Overview

`dcw-soy` is a Cloudflare Workers application that serves a static soy sauce bottle website at dcw.soy. It handles redirects to dave.io and includes caching logic with KV storage.

## Architecture

### Key Components

1. **Static Assets Handler** (`src/index.ts`): Serves the main website (soy bottle animation) from `/public`
2. **Redirect System**: Validates and handles redirects to dave.io/go/\* paths
3. **KV Caching**: Uses Cloudflare KV for caching valid redirects with TTL and refresh locking
4. **404 Handler**: Custom not-found page for invalid redirects

### Request Flow

1. Root path (`/`) → Serves static site from assets binding
2. Other paths → Validates against cached redirects → Either redirects to dave.io or shows 404
3. Cache refresh happens asynchronously without blocking requests

## Development Commands

```bash
# Install dependencies (using Bun)
bun install

# Start local development server
bun run dev

# Type generation for Cloudflare bindings
bun run cf-typegen

# Linting and type checking
bun run lint                 # Run all linters (Biome, Trunk, TypeScript)
bun run lint:fix            # Auto-fix linting issues
bun run lint:format         # Format code
bun run lint:types          # TypeScript type checking only

# Deployment
bun run deploy              # Deploy to production
bun run deploy:nonprod      # Deploy to non-production (versions upload)
```

## Code Standards

### TypeScript Configuration

- Target: ES2021
- Module: ES2022
- Strict mode enabled
- No emit (compilation handled by Wrangler)

### Formatting (Biome + Trunk)

- 2 spaces indentation
- 120 character line width
- Double quotes for strings
- Semicolons as needed
- No trailing commas
- LF line endings

### Code Patterns

- Use explicit type annotations for function parameters and return types
- Use const for all variables unless reassignment is needed
- Handle errors explicitly (no silent failures)
- Use early returns for error conditions
- Add proper logging for debugging (console.error for errors)

## Testing

Currently no test suite is configured. When adding tests:

- Use Vitest (already in devDependencies)
- Consider using `@cloudflare/vitest-pool-workers` for Worker-specific testing
- Test the redirect logic, caching behavior, and error handling

## Cloudflare KV Structure

- `redirects`: Stores valid redirect paths array with TTL
- `redirects-lock`: Prevents concurrent cache refreshes

## Environment Variables & Bindings

Defined in `wrangler.jsonc`:

- `ASSETS`: Static assets binding for public files
- `KV`: KV namespace for caching (ID: 2e9e71351a6b4918990f79523596863e)

## Important Notes

1. The worker uses "smart" placement mode for optimal performance
2. Observability is enabled for monitoring
3. Cache refresh happens asynchronously using `ctx.waitUntil()` to avoid blocking requests
4. Lock mechanism prevents race conditions during cache updates
5. Fallback behavior: If redirect validation fails, redirect anyway and let dave.io handle it
