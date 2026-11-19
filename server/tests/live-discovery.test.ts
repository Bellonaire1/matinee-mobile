import { describe, it, expect } from 'vitest';
import { app } from '../src/app.js';
import { testRequest } from './helpers/testRequest.js';

describe('Live Neon Database Discovery Verification', () => {
  it('GET /api/v1/movies returns seeded catalog movies with pagination', async () => {
    const res = await testRequest(app, {
      method: 'GET',
      url: '/api/v1/movies?limit=10',
    });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.length).toBeGreaterThanOrEqual(4);
    expect(res.body.pagination.total).toBeGreaterThanOrEqual(4);

    const titles = res.body.data.map((m: any) => m.title);
    expect(titles).toContain('Dune: Part Two');
    expect(titles).toContain('Interstellar');
  });

  it('GET /api/v1/movies supports category filtering', async () => {
    const res = await testRequest(app, {
      method: 'GET',
      url: '/api/v1/movies?category=now_showing',
    });

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(3);
    for (const movie of res.body.data) {
      expect(movie.category).toBe('NOW_SHOWING');
    }
  });

  it('GET /api/v1/movies/:id returns movie details for seeded movie', async () => {
    const res = await testRequest(app, {
      method: 'GET',
      url: '/api/v1/movies/mov-dune-2',
    });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.id).toBe('mov-dune-2');
    expect(res.body.data.title).toBe('Dune: Part Two');
    expect(res.body.data.runtime).toBe(166);
  });

  it('GET /api/v1/movies/:id returns 404 for unknown movie', async () => {
    const res = await testRequest(app, {
      method: 'GET',
      url: '/api/v1/movies/non-existent-movie-id',
    });

    expect(res.status).toBe(404);
    expect(res.body.status).toBe('error');
    expect(res.body.code).toBe('MOVIE_NOT_FOUND');
  });

  it('GET /api/v1/cinemas returns seeded Lagos cinemas with auditorium counts', async () => {
    const res = await testRequest(app, {
      method: 'GET',
      url: '/api/v1/cinemas',
    });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data).toHaveLength(4);

    const cinemaNames = res.body.data.map((c: any) => c.name);
    expect(cinemaNames).toContain('Filmhouse Cinemas IMAX');
    expect(cinemaNames).toContain('Genesis Deluxe Cinemas');
    expect(cinemaNames).toContain('EbonyLife Cinemas');
    expect(cinemaNames).toContain('Silverbird Cinemas');

    for (const c of res.body.data) {
      expect(c.city).toBe('Lagos');
      expect(c.country).toBe('Nigeria');
      expect(c.auditoriumCount).toBeGreaterThanOrEqual(1);
    }
  });

  it('GET /api/v1/cinemas/:id/showtimes returns real showtimes with bookability info', async () => {
    const res = await testRequest(app, {
      method: 'GET',
      url: '/api/v1/cinemas/cin-lekki-imax/showtimes',
    });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);

    const firstShowtime = res.body.data[0];
    expect(firstShowtime).toHaveProperty('id');
    expect(firstShowtime).toHaveProperty('movie');
    expect(firstShowtime).toHaveProperty('auditorium');
    expect(firstShowtime).toHaveProperty('startTime');
    expect(firstShowtime).toHaveProperty('pricing');
    expect(firstShowtime).toHaveProperty('isBookable');
    expect(firstShowtime).toHaveProperty('bookingWindowStatus');

    // Confirm price models agreement: Standard 700000 kobo (₦7,000)
    expect(firstShowtime.pricing.basePriceKobo).toBe(700000);
    expect(firstShowtime.pricing.vipPriceKobo).toBe(950000);
    expect(firstShowtime.pricing.couplePairPriceKobo).toBe(1200000);
  });

  it('GET /api/v1/cinemas/:id/showtimes returns 404 for unknown cinema', async () => {
    const res = await testRequest(app, {
      method: 'GET',
      url: '/api/v1/cinemas/unknown-cinema-id/showtimes',
    });

    expect(res.status).toBe(404);
    expect(res.body.status).toBe('error');
    expect(res.body.code).toBe('CINEMA_NOT_FOUND');
  });
});
