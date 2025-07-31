# dcw.soy

It's just soy sauce. Click the bottle to visit [dave.io](https://dave.io)!

## 🛠️ Development

This project uses **Bun** as the package manager and Cloudflare Workers for hosting.

### Prerequisites

- [Bun](https://bun.sh) (v1.2.19 or later)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler)

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

This project uses [Trunk](https://trunk.io) for linting and formatting to maintain code quality.

## 📂 Project Structure

```plaintext
├── src/
│   └── index.js          # Cloudflare Worker entry point
├── static/
│   ├── index.html        # Main site with animations
│   ├── soy.webp          # Soy sauce bottle image
│   └── duck.webp         # A duck, used for dave.io integration tests
├── wrangler.jsonc        # Cloudflare Workers configuration
└── package.json          # Project dependencies and scripts
```

## 🎨 Features

- **Smooth Animations**: CSS keyframes for bouncing, floating, and sparkling effects
- **Interactive Elements**: Click/keyboard navigation with satisfying feedback
- **Responsive Design**: Adapts to different screen sizes
- **Performance Optimized**: Lightweight static assets served via Cloudflare Workers

## 📝 License

[MIT](LICENSE).
