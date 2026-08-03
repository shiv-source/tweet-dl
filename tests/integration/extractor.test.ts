import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { XClient } from '../../src/tweet/client.js';
import { extractVideo } from '../../src/tweet/extractor.js';
import { HttpClient } from '../../src/http/client.js';
import { CookieJar } from '../../src/http/cookiejar.js';
import { AuthRequiredError, NoVideoError } from '../../src/core/errors.js';
import { createLogger } from '../../src/logger.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

const fixturesDir = path.resolve(import.meta.dirname, '../fixtures');
const logger = createLogger(false);

const server = setupServer(
    // Guest token activation
    http.post('https://api.x.com/1.1/guest/activate.json', () => {
        return HttpResponse.json({ guest_token: 'test-guest-token-123' });
    }),

    // GraphQL TweetResultByRestId — normal tweet with video
    http.get('https://x.com/i/api/graphql/2ICDjqPd81tulZcYrtpTuQ/TweetResultByRestId', ({ request }) => {
        const url = new URL(request.url);
        const variables = url.searchParams.get('variables');
        if (!variables) {
            return HttpResponse.json({ errors: [{ message: 'Bad request' }] }, { status: 400 });
        }
        const parsed = JSON.parse(variables) as Record<string, unknown>;
        const tweetId = parsed['tweetId'] as string;

        if (tweetId === 'good') {
            const data = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'tweet-result.json'), 'utf-8')) as Record<
                string,
                unknown
            >;
            return HttpResponse.json(data);
        }

        if (tweetId === 'visibility') {
            const data = JSON.parse(
                fs.readFileSync(path.join(fixturesDir, 'tweet-with-visibility.json'), 'utf-8'),
            ) as Record<string, unknown>;
            return HttpResponse.json(data);
        }

        if (tweetId === 'tombstone') {
            const data = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'tweet-tombstone.json'), 'utf-8')) as Record<
                string,
                unknown
            >;
            return HttpResponse.json(data);
        }

        if (tweetId === 'protected') {
            return HttpResponse.json({
                data: {
                    tweetResult: {
                        result: {
                            __typename: 'TweetUnavailable',
                            reason: 'Protected',
                        },
                    },
                },
            });
        }

        if (tweetId === 'nsfw') {
            return HttpResponse.json({
                data: {
                    tweetResult: {
                        result: {
                            __typename: 'TweetUnavailable',
                            reason: 'NsfwLoggedOut',
                        },
                    },
                },
            });
        }

        return HttpResponse.json({ data: {} }, { status: 404 });
    }),
);

function createClient(): { xClient: XClient; cookieJar: CookieJar; http: HttpClient } {
    const cookieJar = new CookieJar();
    const http = new HttpClient({ cookieJar, logger });
    const xClient = new XClient(http, cookieJar, logger);
    return { xClient, cookieJar, http };
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());

describe('extractVideo (integration with MSW)', () => {
    it('extracts video info from a normal tweet', async () => {
        const { xClient, http } = createClient();
        const videoInfo = await extractVideo('good', xClient, http, logger);

        expect(videoInfo.m3u8Url).toContain('.m3u8');
        expect(videoInfo.durationMs).toBe(31831);
        expect(videoInfo.dimensions).toEqual({ width: 720, height: 776 });
        expect(videoInfo.mp4Variants).toHaveLength(1);
    });

    it('handles TweetWithVisibilityResults wrapper', async () => {
        const { xClient, http } = createClient();
        const videoInfo = await extractVideo('visibility', xClient, http, logger);

        expect(videoInfo.mp4Variants).toHaveLength(1);
        expect(videoInfo.durationMs).toBe(5000);
    });

    it('throws NoVideoError for deleted tweets', async () => {
        const { xClient, http } = createClient();
        await expect(extractVideo('tombstone', xClient, http, logger)).rejects.toThrow(NoVideoError);
    });

    it('throws AuthRequiredError for protected tweets', async () => {
        const { xClient, http } = createClient();
        await expect(extractVideo('protected', xClient, http, logger)).rejects.toThrow(AuthRequiredError);
    });

    it('throws AuthRequiredError for NSFW tweets', async () => {
        const { xClient, http } = createClient();
        await expect(extractVideo('nsfw', xClient, http, logger)).rejects.toThrow(AuthRequiredError);
    });
});
