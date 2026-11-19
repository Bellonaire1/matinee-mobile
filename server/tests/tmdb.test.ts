import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TmdbService,
  InMemoryCacheService,
  TMDB_ATTRIBUTION,
} from '../src/services/tmdbService.js';
import { env } from '../src/config/env.js';

describe('TMDB Integration Service & Cache Layer', () => {
  let cache: InMemoryCacheService;
  let service: TmdbService;

  beforeEach(() => {
    cache = new InMemoryCacheService();
    service = new TmdbService(
      cache,
      'https://api.themoviedb.org/3',
      'https://image.tmdb.org/t/p',
      2000
    );
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Attribution Requirements', () => {
    it('provides the required TMDB attribution string', () => {
      expect(TMDB_ATTRIBUTION).toBe(
        'This product uses the TMDB API but is not endorsed or certified by TMDB.'
      );
      expect(service.getAttribution()).toBe(
        'This product uses the TMDB API but is not endorsed or certified by TMDB.'
      );
    });
  });

  describe('InMemoryCacheService', () => {
    it('sets and retrieves cached values within TTL', async () => {
      await cache.set('test:key', { foo: 'bar' }, 60);
      const retrieved = await cache.get<{ foo: string }>('test:key');
      expect(retrieved).toEqual({ foo: 'bar' });
    });

    it('returns null for non-existent cache keys', async () => {
      const retrieved = await cache.get('non_existent');
      expect(retrieved).toBeNull();
    });

    it('expires cached entries after TTL', async () => {
      vi.useFakeTimers();
      try {
        await cache.set('expire:key', 'some-data', 5);
        expect(await cache.get('expire:key')).toBe('some-data');

        vi.advanceTimersByTime(6000);
        expect(await cache.get('expire:key')).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it('supports deletion and clearing cache', async () => {
      await cache.set('key1', 'val1', 60);
      await cache.set('key2', 'val2', 60);
      await cache.del('key1');

      expect(await cache.get('key1')).toBeNull();
      expect(await cache.get('key2')).toBe('val2');

      cache.clear();
      expect(await cache.get('key2')).toBeNull();
    });
  });

  describe('TmdbService with Mocked Fetch', () => {
    it('returns null safely when TMDB credentials are placeholders or absent', async () => {
      const originalKey = env.TMDB_API_KEY;
      const originalToken = env.TMDB_ACCESS_TOKEN;
      try {
        (env as any).TMDB_API_KEY = 'placeholder_tmdb_api_key';
        (env as any).TMDB_ACCESS_TOKEN = 'placeholder_tmdb_access_token';

        const result = await service.getMovieDetails(693134);
        expect(result).toBeNull();
      } finally {
        (env as any).TMDB_API_KEY = originalKey;
        (env as any).TMDB_ACCESS_TOKEN = originalToken;
      }
    });

    it('maps TMDB upstream response with /w500 poster, /w1280 backdrop, and /w185 avatar URLs', async () => {
      const originalKey = env.TMDB_API_KEY;
      const originalToken = env.TMDB_ACCESS_TOKEN;
      try {
        (env as any).TMDB_API_KEY = 'valid_test_api_key_12345';
        (env as any).TMDB_ACCESS_TOKEN = 'valid_test_token_12345';

        const mockTmdbApiResponse = {
          id: 693134,
          title: 'Dune: Part Two',
          tagline: 'Long live the fighters.',
          overview: 'Paul Atreides unites with Chani and the Fremen.',
          poster_path: '/czembW0Rk1Ke7lCJGhkAi0ym9vg.jpg',
          backdrop_path: '/xOMo8BRK7PfcJv9JCnx7s5200bm.jpg',
          runtime: 166,
          adult: false,
          release_date: '2024-03-01',
          genres: [{ id: 878, name: 'Science Fiction' }, { id: 12, name: 'Adventure' }],
          vote_average: 8.245,
          vote_count: 5200,
          credits: {
            crew: [
              { id: 137427, name: 'Denis Villeneuve', job: 'Director' },
              { id: 137428, name: 'Hans Zimmer', job: 'Original Music Composer' },
            ],
            cast: [
              {
                id: 1190668,
                name: 'Timothée Chalamet',
                character: 'Paul Atreides',
                profile_path: '/BE2sdjpgEV2rNTFaUQvxFeAZev.jpg',
              },
              {
                id: 505710,
                name: 'Zendaya',
                character: 'Chani',
                profile_path: '/tyh8B12p829A0m49V.jpg',
              },
            ],
          },
        };

        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => mockTmdbApiResponse,
        } as any);

        const result = await service.getMovieDetails(693134);

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(result).not.toBeNull();
        expect(result?.title).toBe('Dune: Part Two');
        expect(result?.tagline).toBe('Long live the fighters.');
        expect(result?.posterUrl).toBe(
          'https://image.tmdb.org/t/p/w500/czembW0Rk1Ke7lCJGhkAi0ym9vg.jpg'
        );
        expect(result?.backdropUrl).toBe(
          'https://image.tmdb.org/t/p/w1280/xOMo8BRK7PfcJv9JCnx7s5200bm.jpg'
        );
        expect(result?.director).toBe('Denis Villeneuve');
        expect(result?.rating).toBe(8.2);
        expect(result?.cast).toHaveLength(2);
        expect(result?.cast[0].avatarUrl).toBe(
          'https://image.tmdb.org/t/p/w185/BE2sdjpgEV2rNTFaUQvxFeAZev.jpg'
        );
        expect(result?.attribution).toBe(TMDB_ATTRIBUTION);

        // Verify caching: second request shouldn't trigger fetch again
        const cachedResult = await service.getMovieDetails(693134);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(cachedResult).toEqual(result);
      } finally {
        (env as any).TMDB_API_KEY = originalKey;
        (env as any).TMDB_ACCESS_TOKEN = originalToken;
      }
    });

    it('retries once on 429 Rate Limit error', async () => {
      const originalKey = env.TMDB_API_KEY;
      try {
        (env as any).TMDB_API_KEY = 'valid_test_api_key_12345';

        const rateLimitResponse = {
          ok: false,
          status: 429,
          headers: new Headers({ 'retry-after': '1' }),
        };

        const successResponse = {
          ok: true,
          status: 200,
          json: async () => ({
            id: 123,
            title: 'Test Movie',
            overview: 'Test',
            genres: [],
            credits: { cast: [], crew: [] },
          }),
        };

        const fetchSpy = vi
          .spyOn(globalThis, 'fetch')
          .mockResolvedValueOnce(rateLimitResponse as any)
          .mockResolvedValueOnce(successResponse as any);

        const result = await service.getMovieDetails(123);
        expect(fetchSpy).toHaveBeenCalledTimes(2);
        expect(result?.title).toBe('Test Movie');
      } finally {
        (env as any).TMDB_API_KEY = originalKey;
      }
    });

    it('gracefully handles upstream network failures without throwing', async () => {
      const originalKey = env.TMDB_API_KEY;
      try {
        (env as any).TMDB_API_KEY = 'valid_test_api_key_12345';

        vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const result = await service.getMovieDetails(999999);
        expect(result).toBeNull();
        expect(warnSpy).toHaveBeenCalled();
      } finally {
        (env as any).TMDB_API_KEY = originalKey;
      }
    });
  });
});
