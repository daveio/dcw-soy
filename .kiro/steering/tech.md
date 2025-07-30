# Technology Stack

## Runtime & Platform

- **Cloudflare Workers**: Serverless platform for hosting and edge computing
- **TypeScript**: Primary language for worker logic
- **Bun**: Package manager and JavaScript runtime (v1.2.19+)
- **Node.js**: Alternative runtime (v22.17.1+)

## Build System & Tools

- **Wrangler**: Cloudflare Workers CLI for development and deployment
- **Vitest**: Testing framework with Cloudflare Workers pool
- **Trunk**: Code quality tooling for linting and formatting
- **Biome**: Additional code formatting and linting

## Development Environment

- **mise**: Development environment manager with tool versioning
- **TypeScript**: Strict mode enabled with ES2021 target
- **Assets Binding**: Static file serving through Cloudflare Workers

## Common Commands

### Development

```bash
# Install dependencies
bun install

# Start local development server
bun run dev

# Generate TypeScript types for Cloudflare bindings
bun run cf-typegen
```

### Deployment

```bash
# Deploy to Cloudflare Workers
bun run deploy
```

### Code Quality

- Trunk handles linting and formatting automatically
- TypeScript strict mode enforced
- Biome configuration available for additional formatting

## Key Dependencies

- `@cloudflare/vitest-pool-workers`: Testing in Workers environment
- `wrangler`: Cloudflare Workers development toolkit
- `typescript`: Type checking and compilation
- `vitest`: Unit testing framework
