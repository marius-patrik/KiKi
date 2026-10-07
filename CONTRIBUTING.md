# Contributing

Contributions are welcome! Here's how to contribute.

## What kind of contributions

- **Bug fixes** — always welcome
- **Documentation** — always welcome
- **New features** — please open an issue first to discuss scope
- **Plugins** — follow the plugin conventions in AGENTS.md

## Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Run the checks (`node check-plugin.mjs` for plugins)
5. Commit with a clear message (`<verb>: <subject>`)
6. Push and open a PR

## Code style

- TypeScript with strict mode
- No zod — use `@deepseek-ai/schemastery`
- Every plugin needs a `check-plugin.mjs`
- Follow the conventions in `AGENTS.md`

## Review process

The maintainer reviews PRs. Response times may vary — this is a personal
project maintained alongside other work. PRs that follow the conventions
above will get priority review.

## What NOT to contribute

- Changes to the harness (`DSH/`) — it's pinned and pristine
- Breaking changes without discussion
- Features that don't align with the project's direction
- Code that doesn't pass the existing checks
