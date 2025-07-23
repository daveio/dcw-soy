# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Install dependencies
bun install

# Start local development server
bun run dev

# Preview with remote Cloudflare environment
bun run preview

# Deploy to production
bun run deploy

# Run linters (via Trunk)
trunk check
trunk fmt
```

## Architecture Overview

This is a Cloudflare Workers static site project that serves an animated landing page at dcw.soy which redirects to dave.io.

### Key Components

1. **Backend (src/index.js)**: Minimal Cloudflare Worker that serves static assets via `env.ASSETS.fetch(request)`

2. **Frontend (static/index.html)**: Single-page application with:
   - Bouncing Kikkoman soy sauce bottle animation
   - Food emoji particles (🍣🍜🍱🥟🍚) rising from bottom
   - Sparkle effects and trail dots
   - Ripple effects on boundary collisions
   - Click handler that scales the bottle and redirects to dave.io

3. **Assets (static/soy.webp)**: Soy sauce bottle image in WebP format

### Technology Stack

- **Runtime**: Cloudflare Workers (edge serverless)
- **Package Manager**: Bun (not npm/yarn)
- **Build Tool**: Wrangler (Cloudflare's CLI)
- **Languages**: JavaScript (ES modules), HTML, CSS
- **Code Quality**: Trunk with markdownlint, prettier, security scanners

### Important Notes

- No TypeScript configuration - use plain JavaScript
- No build process - source files are deployed directly
- No test framework configured - add tests if implementing logic
- Animation logic is in inline JavaScript within index.html
- All static assets must be placed in the `static/` directory
- Cloudflare Worker responds to all routes by serving static assets
