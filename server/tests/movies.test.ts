import { describe, it, expect, vi, beforeEach } from 'vitest';
import { app } from '../src/app.js';
import { testRequest } from './helpers/testRequest.js';
import { prisma } from '../src/db.js';
import tmdbService from '../src/services/tmdbService.js';

describe('Movies API (/api/v1/movies)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/v1/movies', () => {
    it('returns 200 with paginated movie list and correct pagination metadata', async () => {
      const mockMovies = [
        {
          id: 'movie-1',
          title: 'Dune: Part Two',
          slug: 'dune-part-two',
          synopsis: 'Paul Atreides unites with Chani and the Fremen.',
          posterUrl: 'https://image.tmdb.org/t/p/w500/poster1.jpg',
          backdropUrl: 'https://image.tmdb.org/t/p/w1280/backdrop1.jpg',
          releaseDate: new Date('2024-03-01'),
          durationMinutes: 166,
          rating: 'PG-13',
          genres: ['Sci-Fi', 'Adventure'],
          director: 'Denis Villeneuve',
          cast: ['Timothée Chalamet', 'Zendaya'],
          category: 'NOW_SHOWING',
          trailerUrl: null,
          tmdbId: 693134,
          imdbId: 'tt15239678',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      vi.spyOn(prisma.movie, 'count').mockResolvedValue(1);
      vi.spyOn(prisma.movie, 'findMany').mockResolvedValue(mockMovies as any);

      const res = await testRequest(app, {
        method: 'GET',
        url: '/api/v1/movies?page=1&limit=10',
      });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'success');
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].title).toBe('Dune: Part Two');
      expect(res.body.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      });
    });

    it('filters movies by category case-insensitively', async () => {
      const countSpy = vi.spyOn(prisma.movie, 'count').mockResolvedValue(0);
      vi.spyOn(prisma.movie, 'findMany').mockResolvedValue([]);

      const res = await testRequest(app, {
        method: 'GET',
        url: '/api/v1/movies?category=now_showing',
      });

      expect(res.status).toBe(200);
      expect(countSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            category: 'NOW_SHOWING',
            isActive: true,
          }),
        })
      );
    });

    it('filters movies by genre and search term', async () => {
      const countSpy = vi.spyOn(prisma.movie, 'count').mockResolvedValue(0);
      vi.spyOn(prisma.movie, 'findMany').mockResolvedValue([]);

      const res = await testRequest(app, {
        method: 'GET',
        url: '/api/v1/movies?genre=Sci-Fi&search=Dune',
      });

      expect(res.status).toBe(200);
      expect(countSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            genres: { has: 'Sci-Fi' },
            isActive: true,
            OR: [
              { title: { contains: 'Dune', mode: 'insensitive' } },
              { synopsis: { contains: 'Dune', mode: 'insensitive' } },
              { director: { contains: 'Dune', mode: 'insensitive' } },
            ],
          }),
        })
      );
    });

    it('returns 400 when category is invalid', async () => {
      const res = await testRequest(app, {
        method: 'GET',
        url: '/api/v1/movies?category=INVALID_CATEGORY',
      });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('status', 'error');
      expect(res.body).toHaveProperty('code', 'VALIDATION_ERROR');
    });

    it('returns 400 when pagination limit exceeds 100', async () => {
      const res = await testRequest(app, {
        method: 'GET',
        url: '/api/v1/movies?limit=150',
      });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('status', 'error');
      expect(res.body).toHaveProperty('code', 'VALIDATION_ERROR');
    });
  });

  describe('GET /api/v1/movies/:id', () => {
    const baseMockMovie = {
      id: 'movie-1',
      title: 'Dune: Part Two',
      slug: 'dune-part-two',
      synopsis: 'Paul Atreides unites with Chani and the Fremen.',
      posterUrl: 'https://matinee.internal/db-poster.jpg',
      backdropUrl: 'https://matinee.internal/db-backdrop.jpg',
      releaseDate: new Date('2024-03-01'),
      durationMinutes: 166,
      rating: 'PG-13',
      genres: ['Sci-Fi', 'Adventure'],
      director: 'Denis Villeneuve',
      cast: ['Timothée Chalamet', 'Zendaya'],
      category: 'NOW_SHOWING',
      trailerUrl: null,
      tmdbId: 693134,
      imdbId: 'tt15239678',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('enriches movie details with TMDB metadata when TMDB service returns data', async () => {
      vi.spyOn(prisma.movie, 'findUnique').mockResolvedValue(baseMockMovie as any);
      vi.spyOn(tmdbService, 'getMovieDetails').mockResolvedValue({
        tmdbId: 693134,
        title: 'Dune: Part Two',
        tagline: 'Long live the fighters.',
        synopsis: 'Paul Atreides unites with Chani.',
        posterUrl: 'https://image.tmdb.org/t/p/w500/tmdb-poster.jpg',
        backdropUrl: 'https://image.tmdb.org/t/p/w1280/tmdb-backdrop.jpg',
        runtime: 166,
        ageRating: 'PG-13',
        releaseYear: 2024,
        releaseDate: '2024-03-01',
        genres: ['Sci-Fi'],
        rating: 8.5,
        votesCount: 4500,
        director: 'Denis Villeneuve',
        cast: [],
        attribution: 'This product uses the TMDB API but is not endorsed or certified by TMDB.',
      });

      const res = await testRequest(app, {
        method: 'GET',
        url: '/api/v1/movies/movie-1',
      });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.id).toBe('movie-1');
      expect(res.body.data.posterUrl).toBe('https://image.tmdb.org/t/p/w500/tmdb-poster.jpg');
      expect(res.body.data.tagline).toBe('Long live the fighters.');
      expect(res.body.data.attribution).toContain('TMDB API');
      expect(res.body.data.tmdb).toBeDefined();
      expect(res.body.data.tmdb.tmdbId).toBe(693134);
    });

    it('preserves database data safely when TMDB service returns null (placeholder/offline)', async () => {
      vi.spyOn(prisma.movie, 'findUnique').mockResolvedValue(baseMockMovie as any);
      vi.spyOn(tmdbService, 'getMovieDetails').mockResolvedValue(null);

      const res = await testRequest(app, {
        method: 'GET',
        url: '/api/v1/movies/movie-1',
      });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.id).toBe('movie-1');
      expect(res.body.data.posterUrl).toBe('https://matinee.internal/db-poster.jpg');
      expect(res.body.data.backdropUrl).toBe('https://matinee.internal/db-backdrop.jpg');
    });

    it('returns 404 when movie is not found', async () => {
      vi.spyOn(prisma.movie, 'findUnique').mockResolvedValue(null);

      const res = await testRequest(app, {
        method: 'GET',
        url: '/api/v1/movies/non-existent-id',
      });

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('status', 'error');
      expect(res.body).toHaveProperty('message');
      expect(res.body.message).toContain('non-existent-id');
    });
  });
});
