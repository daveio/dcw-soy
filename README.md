# dcw.soy

A delightfully animated static site featuring a bouncing Kikkoman soy sauce bottle. Click the bottle to visit [dave.io](https://dave.io)!

## 🥢 What is this?

This is a fun, interactive static site deployed on Cloudflare Workers. It features:

- An animated soy sauce bottle that bounces around the screen
- Food emoji particles floating upward
- Sparkle effects and trailing animations
- A satisfying click animation that redirects to dave.io

## 🛠️ Development

This project uses **Bun** as the package manager and Cloudflare Workers for hosting.

### Prerequisites

- [Bun](https://bun.sh/) (v1.2.19 or later)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)

### Getting Started

```bash
# Install dependencies
bun install

# Start local development server
bun run dev

# Preview with remote environment
bun run preview
```

### Deployment

```bash
# Deploy to Cloudflare Workers
bun run deploy
```

## 🔧 Code Quality

This project uses [Trunk](https://trunk.io/) for linting and formatting to maintain code quality.

## 📂 Project Structure

```
├── src/
│   └── index.js          # Cloudflare Worker entry point
├── static/
│   ├── index.html        # Main site with animations
│   └── soy.webp         # Soy sauce bottle image
├── wrangler.jsonc        # Cloudflare Workers configuration
└── package.json          # Project dependencies and scripts
```

## 🎨 Features

- **Smooth Animations**: CSS keyframes for bouncing, floating, and sparkling effects
- **Interactive Elements**: Click/keyboard navigation with satisfying feedback
- **Responsive Design**: Adapts to different screen sizes
- **Performance Optimized**: Lightweight static assets served via Cloudflare Workers

## 📝 License

MIT - See the package.json for details.

---

_Made with ❤️ and soy sauce by [Dave Williams](https://dave.io)_
