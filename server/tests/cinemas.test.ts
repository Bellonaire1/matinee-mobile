import { describe, it, expect, vi, beforeEach } from 'vitest';
import { app } from '../src/app.js';
import { testRequest } from './helpers/testRequest.js';
import { prisma } from '../src/db.js';

describe('Cinemas API (/api/v1/cinemas)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/v1/cinemas', () => {
    it('returns 200 with list of cinemas including auditorium counts', async () => {
      const mockCinemas = [
        {
          id: 'cinema-central',
          name: 'Matinee Central Cinema',
          chain: 'Matinee Premier',
          neighborhood: 'Soho',
          address: '100 Main Street',
          city: 'London',
          country: 'GB',
          latitude: 51.5136,
          longitude: -0.1365,
          features: ['IMAX', 'DOLBY_ATMOS', 'VIP_LOUNGE'],
          createdAt: new Date(),
          updatedAt: new Date(),
          _count: {
            auditoriums: 4,
          },
        },
      ];

      vi.spyOn(prisma.cinema, 'findMany').mockResolvedValue(mockCinemas as any);

      const res = await testRequest(app, {
        method: 'GET',
        url: '/api/v1/cinemas',
      });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'success');
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Matinee Central Cinema');
      expect(res.body.data[0].auditoriumCount).toBe(4);
    });

    it('filters cinemas by city and neighborhood', async () => {
      const findManySpy = vi.spyOn(prisma.cinema, 'findMany').mockResolvedValue([]);

      const res = await testRequest(app, {
        method: 'GET',
        url: '/api/v1/cinemas?city=London&neighborhood=Soho',
      });

      expect(res.status).toBe(200);
      expect(findManySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            city: { equals: 'London', mode: 'insensitive' },
            neighborhood: { contains: 'Soho', mode: 'insensitive' },
          }),
        })
      );
    });
  });

  describe('GET /api/v1/cinemas/:id/showtimes', () => {
    it('returns 200 with showtimes list and correct bookability and bookingWindowStatus', async () => {
      vi.spyOn(prisma.cinema, 'findUnique').mockResolvedValue({
        id: 'cinema-central',
        name: 'Matinee Central Cinema',
      } as any);

      const futureDate1 = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const futureDate2 = new Date(Date.now() + 48 * 60 * 60 * 1000);

      const mockShowtimes = [
        {
          id: 'showtime-open',
          auditoriumId: 'auditorium-1',
          movieId: 'movie-1',
          startTime: futureDate1,
          endTime: new Date(futureDate1.getTime() + 2 * 60 * 60 * 1000),
          format: 'IMAX',
          basePriceKobo: 185000,
          vipPriceKobo: 250000,
          couplePairPriceKobo: 320000,
          accessiblePriceKobo: 185000,
          status: 'OPEN_FOR_BOOKING',
          createdAt: new Date(),
          updatedAt: new Date(),
          movie: {
            id: 'movie-1',
            title: 'Dune: Part Two',
            posterUrl: 'https://image.tmdb.org/t/p/w500/poster1.jpg',
            ageRating: 'PG-13',
            runtime: 166,
            genres: ['Sci-Fi', 'Adventure'],
          },
          auditorium: {
            id: 'auditorium-1',
            name: 'Screen 1',
            screenNumber: 1,
            totalSeats: 320,
          },
        },
        {
          id: 'showtime-scheduled',
          auditoriumId: 'auditorium-1',
          movieId: 'movie-1',
          startTime: futureDate2,
          endTime: new Date(futureDate2.getTime() + 2 * 60 * 60 * 1000),
          format: 'IMAX',
          basePriceKobo: 185000,
          vipPriceKobo: 250000,
          couplePairPriceKobo: 320000,
          accessiblePriceKobo: 185000,
          status: 'SCHEDULED',
          createdAt: new Date(),
          updatedAt: new Date(),
          movie: {
            id: 'movie-1',
            title: 'Dune: Part Two',
            posterUrl: 'https://image.tmdb.org/t/p/w500/poster1.jpg',
            ageRating: 'PG-13',
            runtime: 166,
            genres: ['Sci-Fi', 'Adventure'],
          },
          auditorium: {
            id: 'auditorium-1',
            name: 'Screen 1',
            screenNumber: 1,
            totalSeats: 320,
          },
        },
      ];

      vi.spyOn(prisma.showtime, 'findMany').mockResolvedValue(mockShowtimes as any);

      const res = await testRequest(app, {
        method: 'GET',
        url: '/api/v1/cinemas/cinema-central/showtimes',
      });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'success');
      expect(res.body.data).toHaveLength(2);

      // Verify OPEN_FOR_BOOKING screening
      expect(res.body.data[0].id).toBe('showtime-open');
      expect(res.body.data[0].status).toBe('OPEN_FOR_BOOKING');
      expect(res.body.data[0].isBookable).toBe(true);
      expect(res.body.data[0].bookingWindowStatus).toBe('OPEN');

      // Verify SCHEDULED screening (never represented as bookable)
      expect(res.body.data[1].id).toBe('showtime-scheduled');
      expect(res.body.data[1].status).toBe('SCHEDULED');
      expect(res.body.data[1].isBookable).toBe(false);
      expect(res.body.data[1].bookingWindowStatus).toBe('OPENS_SOON');
    });

    it('filters showtimes using Lagos-local day boundaries (+01:00)', async () => {
      vi.spyOn(prisma.cinema, 'findUnique').mockResolvedValue({
        id: 'cinema-central',
        name: 'Matinee Central Cinema',
      } as any);

      const findManySpy = vi.spyOn(prisma.showtime, 'findMany').mockResolvedValue([]);

      const res = await testRequest(app, {
        method: 'GET',
        url: '/api/v1/cinemas/cinema-central/showtimes?date=2026-11-20',
      });

      expect(res.status).toBe(200);
      expect(findManySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            startTime: {
              gte: new Date('2026-11-20T00:00:00.000+01:00'),
              lte: new Date('2026-11-20T23:59:59.999+01:00'),
            },
          }),
        })
      );
    });

    it('returns 404 when cinema does not exist', async () => {
      vi.spyOn(prisma.cinema, 'findUnique').mockResolvedValue(null);

      const res = await testRequest(app, {
        method: 'GET',
        url: '/api/v1/cinemas/non-existent-cinema/showtimes',
      });

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('status', 'error');
      expect(res.body).toHaveProperty('message');
      expect(res.body.message).toContain('non-existent-cinema');
    });

    it('returns 400 when date parameter has invalid format', async () => {
      const res = await testRequest(app, {
        method: 'GET',
        url: '/api/v1/cinemas/cinema-central/showtimes?date=20-11-2026',
      });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('status', 'error');
      expect(res.body).toHaveProperty('code', 'VALIDATION_ERROR');
    });
  });
});
