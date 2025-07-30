# Project Structure

## Root Directory Layout

```plaintext
├── src/                    # TypeScript source code
│   └── index.ts           # Main Cloudflare Worker entry point
├── public/                # Static assets served via Assets binding
│   ├── index.html         # Main interactive landing page
│   ├── not-found.html     # Custom 404 page
│   ├── soy.webp          # Soy sauce bottle image
│   └── duck.webp         # Additional asset
├── .kiro/                 # Kiro AI assistant configuration
│   └── steering/          # AI guidance documents
├── .trunk/                # Trunk code quality configuration
├── .wrangler/             # Wrangler build artifacts and cache
└── node_modules/          # Dependencies
```

## Key Configuration Files

- `wrangler.jsonc`: Cloudflare Workers configuration with assets binding
- `package.json`: Dependencies and npm scripts
- `tsconfig.json`: TypeScript compiler configuration (strict mode, ES2021)
- `mise.toml`: Development environment and tool versioning
- `biome.json`: Code formatting configuration

## Source Code Organization

### src/index.ts

- Main Worker export with `fetch` handler
- Route handling for root path vs redirects
- Redirect validation logic
- 404 error handling
- Clean separation of concerns with dedicated functions

### public/ Assets

- `index.html`: Self-contained with inline CSS and JavaScript
- Static images served directly through Assets binding
- Custom 404 page for failed redirects

## Development Patterns

- Single-file Worker for simplicity
- Explicit type annotations throughout
- Async/await for all network operations
- Proper error handling with fallbacks
- Clean function separation for testability

## Asset Management

- Static files in `public/` directory
- Automatic serving via Cloudflare Assets binding
- WebP format for optimized images
- Self-contained HTML with embedded styles and scripts
