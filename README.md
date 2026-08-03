# tweet-dl

Download videos from Twitter/X posts — as a CLI tool or a Node.js library.

[![npm](https://img.shields.io/npm/v/tweet-dl)](https://www.npmjs.com/package/tweet-dl)
[![CI](https://github.com/shiv-source/tweet-dl/actions/workflows/ci.yaml/badge.svg)](https://github.com/shiv-source/tweet-dl/actions/workflows/ci.yaml)

## Features

- Download any Twitter/X video as a single MP4 file
- HLS stream support — downloads segments concurrently, merges with FFmpeg
- Separate audio track handling (Twitter serves audio and video in different streams)
- Guest access for public tweets — no login required
- Cookie-based authentication for private/protected tweets
- Quality selection: `best`, `1080p`, `720p`, `480p`
- Progress bar with ETA
- Automatic retry with exponential backoff
- Syndication fallback when GraphQL query ID rotates

## Install

```bash
npm install -g tweet-dl
```

Requires **Node.js ≥ 20.11** and **FFmpeg** on your PATH.

If FFmpeg is not installed:
- **macOS:** `brew install ffmpeg`
- **Ubuntu:** `sudo apt install ffmpeg`
- **Windows:** `winget install ffmpeg`

The optional dependency `ffmpeg-static` provides a bundled fallback if system FFmpeg is unavailable.

## CLI Usage

```bash
tweet-dl <tweet-url> [options]
```

### Options

| Option | Default | Description |
|---|---|---|
| `-o, --output <path>` | `./video-{timestamp}.mp4` | Output file path |
| `-q, --quality <q>` | `best` | `best`, `1080p`, `720p`, or `480p` |
| `-c, --cookies <path>` | — | Path to cookies.txt (Netscape format) |
| `--cookies-from-browser <browser>` | — | Extract cookies from Chrome/Firefox/Edge (coming soon) |
| `--verbose` | `false` | Enable debug logging |
| `--no-progress` | `false` | Disable progress bar |
| `-h, --help` | — | Show help |

### Examples

```bash
# Download at best quality (default)
tweet-dl https://x.com/user/status/12345

# Download at 720p with custom filename
tweet-dl https://x.com/user/status/12345 -q 720p -o my-video.mp4

# Download a protected tweet using cookies
tweet-dl https://x.com/user/status/12345 -c cookies.txt --verbose

# Quiet download (no progress bar)
tweet-dl https://x.com/user/status/12345 --no-progress -o video.mp4
```

### Getting Cookies

Use a browser extension to export cookies in Netscape format:

- [Chrome: cookies.txt](https://chrome.google.com/webstore/detail/cookiestxt/njabckikapfpffapmjgojcnbfjonfjfg)
- [Firefox: cookies.txt](https://addons.mozilla.org/en-US/firefox/addon/cookies-txt/)

Log in to X, then export. The file must contain at minimum `auth_token` and `ct0`.

## Library Usage

Import and use as a dependency in your own project:

```ts
import { run, parseTweetUrl, extractVideo, HttpClient, CookieJar } from 'tweet-dl';

// Simple: download a public video
await run({
  tweetUrl: 'https://x.com/user/status/12345',
  quality: '720p',
  output: './video.mp4',
  onProgress: (done, total) => console.log(`${done}/${total} segments`),
});

// Advanced: extract video metadata without downloading
const { statusId } = parseTweetUrl('https://x.com/user/status/12345');
const http = new HttpClient();
const cookieJar = new CookieJar();
const videoInfo = await extractVideo(statusId, /* XClient */, http);
console.log(videoInfo.m3u8Url);
```

### Library API

| Export | Type | Description |
|---|---|---|
| `run(options)` | function | Full pipeline: extract → download → merge |
| `parseTweetUrl(url)` | function | Parse and validate a tweet URL |
| `extractVideo(id, xClient, http)` | function | Extract video metadata via X API |
| `downloadSegments(...)` | function | Download HLS segments concurrently |
| `mergeSegments(...)` | function | Merge segments into MP4 with FFmpeg |
| `HttpClient`, `CookieJar` | class | HTTP client with retry + cookie support |
| `parseNetscapeCookies(path)` | function | Parse cookies.txt files |
| `parseMasterPlaylist(text, url)` | function | Parse HLS master playlist |
| `selectVariant(variants, quality)` | function | Select quality from HLS variants |
| `TwdlError` + subclasses | class | Typed error hierarchy with exit codes |
| `RunOptions`, `VideoInfo`, ... | type | All public types |

Full API documentation: see `dist/index.d.ts` (shipped with the package) or `src/index.ts`.

### Cancellation

```ts
const controller = new AbortController();

// Cancel after 60 seconds
setTimeout(() => controller.abort(), 60_000);

await run({
  tweetUrl: 'https://x.com/user/status/12345',
  signal: controller.signal,
});
```

### Custom Progress

```ts
await run({
  tweetUrl: 'https://x.com/user/status/12345',
  onProgress: (completed, total) => {
    console.log(`${completed}/${total} segments downloaded`);
  },
});
```

## How It Works

```
tweet URL → parseTweetUrl()
  → XClient.ensureGuestToken()          (or -c cookies.txt)
  → GraphQL TweetResultByRestId         (primary)
  → Syndication fallback                 (if query ID rotated)
  → Select quality from HLS master      (best / 1080p / 720p / 480p)
  → Download video segments (8 concurrent workers)
  → Download audio segments              (separate HLS stream)
  → Merge with FFmpeg (-c copy + faststart)
  → output.mp4
```

## API Stability

X rotates their GraphQL query IDs every 1–4 weeks. When the primary extraction fails, the tool automatically falls back to the syndication endpoint (`cdn.syndication.twimg.com`), which does not require a query ID.

To update the query ID manually, see [CONTRIBUTING.md](CONTRIBUTING.md#finding-xs-current-query-id).

## Development

```bash
git clone https://github.com/shiv-source/tweet-dl.git
cd tweet-dl
npm install
npm run build
npm test
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed development guide and project structure.

## License

[MIT](LICENSE)
