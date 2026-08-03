# Contributing to tweet-dl

Thanks for contributing! Here's how to get started.

## Development Setup

```bash
git clone https://github.com/shiv-source/tweet-dl.git
cd tweet-dl
npm install
npm run build
```

## Scripts

| Command | What it does |
|---|---|
| `npm run build` | Compile TypeScript (`tsc`) |
| `npm run dev` | Run CLI directly via `tsx` (no build) |
| `npm test` | Run unit + integration tests (`vitest`) |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Auto-fix lint issues |
| `npm run typecheck` | TypeScript type-check only (no emit) |
| `npm run build:clean` | Clean + build from scratch |

## Project Structure

```
src/
├── index.ts          # Library entry — public API surface
├── cli.ts            # CLI entry (commander)
├── main.ts           # Pipeline orchestration
├── logger.ts         # Leveled logging
├── core/             # Types, errors, config constants
├── http/             # HTTP client, cookie jar, file download
├── tweet/            # URL parsing, X API client, video extraction
├── hls/              # HLS playlist parsing, quality selection, segment download
├── cookies/          # Netscape-format cookie parser
├── media/            # FFmpeg locator, segment merge, progress bars
└── util/             # Path resolution, concurrency pool
tests/
├── unit/             # Pure module tests (no network)
├── integration/      # API + pipeline tests (mocked HTTP via MSW)
└── fixtures/         # Static test data (m3u8, cookies.txt, API responses)
```

## Pull Request Checklist

- [ ] `npm run lint && npm run typecheck && npm test` passes
- [ ] `npm run build` succeeds
- [ ] Smoke test: `node dist/cli.js "<url>" --verbose` produces a valid MP4
- [ ] Follow [conventional commits](https://www.conventionalcommits.org/)
- [ ] Update `QUERY_ID` in `src/core/config.ts` if X has rotated it

## Finding X's Current Query ID

X rotates GraphQL query IDs every 1–4 weeks. When downloads stop working:

1. Open <https://x.com> in Chrome → DevTools → Network tab
2. Filter for `graphql`
3. Find a `TweetResultByRestId` request, copy the 22-character ID from the URL
4. Update `QUERY_ID` in `src/core/config.ts`
5. Run `npm run build`

The syndication fallback (`cdn.syndication.twimg.com`) handles stale IDs automatically in most cases.

## Releasing

```bash
npm version patch   # or minor / major
git push --follow-tags
```

GitHub Actions will verify (lint + typecheck + test), build, and publish.
