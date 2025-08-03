# [`dcw.soy`](https://dcw.soy)

[It's just soy sauce](https://dcw.soy). Click the bottle to visit [dave.io](https://dave.io)!

> [!TIP]
> This codebase has documentation for AI agents.
>
> See [`github/copilot-instructions.md`](.github/copilot-instructions.md).
>
> [`AGENTS.md`](AGENTS.md) and [`CLAUDE.md`](CLAUDE.md) symlink to this file.

## 🌟 Overview

`dcw-soy` is a Cloudflare Workers application that serves a delightful soy sauce bottle animation website. Beyond the playful frontend, it includes a sophisticated redirect system with intelligent caching using Cloudflare KV storage.

## 🛠️ Development

This project uses **Bun** as the package manager and Cloudflare Workers for hosting.

### Prerequisites

- [Bun](https://bun.sh) (v1.2.19 or later)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler)
- Node.js 22.18.0 or later

### Getting Started

```bash
# Install dependencies
bun install

# Start local development server
bun run dev

# Type generation for Cloudflare bindings
bun run cf-typegen
```

### Linting & Code Quality

```bash
# Run all linters (Biome, Trunk, TypeScript)
bun run lint

# Auto-fix linting issues
bun run lint:fix

# Format code
bun run lint:format

# TypeScript type checking only
bun run lint:types
```

### Deployment

```bash
# Deploy to production
bun run deploy

# Deploy to non-production (versions upload)
bun run deploy:nonprod
```

## 🏗️ Architecture

### Key Components

1. **Static Assets Handler**: Serves the main soy bottle animation from `/public`
2. **Redirect System**: Validates and handles redirects to `dave.io/go/*` paths
3. **KV Caching**: Implements intelligent caching with TTL and refresh locking
4. **404 Handler**: Custom not-found page for invalid redirect paths

### How It Works

- **Root path** (`/`) → Serves the animated soy bottle site
- **Other paths** → Validates against cached redirects → Either redirects to dave.io or shows 404
- **Cache refresh** happens asynchronously without blocking requests
- **Fallback behavior**: If validation fails, redirects anyway and lets dave.io handle it

## 📂 Project Structure

```plaintext
├── src/
│   └── index.ts          # Main Worker with redirect logic & caching
├── public/
│   ├── index.html        # Main site with animations
│   ├── not-found.html    # 404 not found page
│   ├── soy.webp          # Soy sauce bottle image
│   └── duck.webp         # A duck, used by dave.io integration tests
├── wrangler.jsonc        # Cloudflare Workers configuration
├── tsconfig.json         # TypeScript configuration
├── biome.json            # Biome linter configuration
└── package.json          # Project dependencies and scripts
```

## 🎨 Features

- **Smooth Animations**: CSS keyframes for bouncing, floating, and sparkling effects
- **Interactive Elements**: Click/keyboard navigation with satisfying feedback
- **Responsive Design**: Adapts to different screen sizes
- **Performance Optimized**: Lightweight static assets served via Cloudflare Workers
- **Smart Caching**: KV-based redirect validation with automatic refresh
- **Race Condition Prevention**: Lock mechanism ensures cache consistency

## 📝 License

[MIT](LICENSE).
