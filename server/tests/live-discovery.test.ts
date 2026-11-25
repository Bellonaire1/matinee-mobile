import { describe, it, expect, beforeAll } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/db.js';
import { testRequest } from './helpers/testRequest.js';

const liveDiscoveryTestsEnabled = process.env.RUN_LIVE_DISCOVERY_TESTS === 'true';

beforeAll(async () => {
  if (!liveDiscoveryTestsEnabled) {
    console.info(
      '[SKIP] Live discovery integration tests are disabled. Set RUN_LIVE_DISCOVERY_TESTS=true to run them against an explicitly configured test database.'
    );
    return;
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    throw new Error(
      'Live discovery integration tests were enabled, but the configured test database is unavailable.'
    );
  }
});

describe('Live Neon Database Discovery Verification', () => {
  it('GET /api/v1/movies returns seeded catalog movies with pagination', async (ctx) => {
    if (!liveDiscoveryTestsEnabled) {
      ctx.skip();
    }
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

  it('GET /api/v1/movies supports category filtering', async (ctx) => {
    if (!liveDiscoveryTestsEnabled) {
      ctx.skip();
    }
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

  it('GET /api/v1/movies/:id returns movie details for seeded movie', async (ctx) => {
    if (!liveDiscoveryTestsEnabled) {
      ctx.skip();
    }
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

  it('GET /api/v1/movies/:id returns 404 for unknown movie', async (ctx) => {
    if (!liveDiscoveryTestsEnabled) {
      ctx.skip();
    }
    const res = await testRequest(app, {
      method: 'GET',
      url: '/api/v1/movies/non-existent-movie-id',
    });

    expect(res.status).toBe(404);
    expect(res.body.status).toBe('error');
    expect(res.body.code).toBe('MOVIE_NOT_FOUND');
  });

  it('GET /api/v1/cinemas returns seeded Lagos cinemas with auditorium counts', async (ctx) => {
    if (!liveDiscoveryTestsEnabled) {
      ctx.skip();
    }
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

  it('GET /api/v1/cinemas/:id/showtimes returns real showtimes with bookability info', async (ctx) => {
    if (!liveDiscoveryTestsEnabled) {
      ctx.skip();
    }
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

  it('GET /api/v1/cinemas/:id/showtimes returns 404 for unknown cinema', async (ctx) => {
    if (!liveDiscoveryTestsEnabled) {
      ctx.skip();
    }
    const res = await testRequest(app, {
      method: 'GET',
      url: '/api/v1/cinemas/unknown-cinema-id/showtimes',
    });

    expect(res.status).toBe(404);
    expect(res.body.status).toBe('error');
    expect(res.body.code).toBe('CINEMA_NOT_FOUND');
  });

  it('GET /api/v1/cinemas/:id/showtimes accurately marks empty auditoriums as non-bookable', async (ctx) => {
    if (!liveDiscoveryTestsEnabled) {
      ctx.skip();
    }
    // Genesis Palms has an OPEN_FOR_BOOKING showtime but 0 physical seats
    const res = await testRequest(app, {
      method: 'GET',
      url: '/api/v1/cinemas/cin-genesis-palms/showtimes',
    });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);

    const showtime = res.body.data[0];
    expect(showtime.id).toBe('st-dune-genesis-1600');
    expect(showtime.hasConfiguredSeats).toBe(false);
    expect(showtime.totalSeats).toBe(0);
    expect(showtime.isBookable).toBe(false);
    expect(showtime.bookingWindowStatus).toBe('SEATS_UNAVAILABLE');
  });

  describe('Showtime Seat Inventory API (/api/v1/showtimes/:id/seats)', () => {
    it('returns exact 320-seat layout for Filmhouse reference hall with accurate occupancy and pricing', async (ctx) => {
      if (!liveDiscoveryTestsEnabled) {
        ctx.skip();
      }
      const res = await testRequest(app, {
        method: 'GET',
        url: '/api/v1/showtimes/st-dune-lekki-1430/seats',
      });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      const data = res.body.data;

      expect(data.showtimeId).toBe('st-dune-lekki-1430');
      expect(data.cinema.name).toBe('Filmhouse Cinemas IMAX');
      expect(data.auditorium.name).toBe('Screen 1 (Laser IMAX & Recliners)');
      expect(data.auditorium.hasConfiguredSeats).toBe(true);

      // Verify total seat count: 320 seats
      expect(data.totalSeats).toBe(320);
      expect(data.seats).toHaveLength(320);

      // Verify tier distribution: 4 Accessible, 140 Standard, 112 VIP, 64 Couple
      const accessibleSeats = data.seats.filter((s: any) => s.tier === 'ACCESSIBLE');
      const standardSeats = data.seats.filter((s: any) => s.tier === 'STANDARD');
      const vipSeats = data.seats.filter((s: any) => s.tier === 'VIP');
      const coupleSeats = data.seats.filter((s: any) => s.tier === 'COUPLE');

      expect(accessibleSeats).toHaveLength(4);
      expect(standardSeats).toHaveLength(140);
      expect(vipSeats).toHaveLength(112);
      expect(coupleSeats).toHaveLength(64);

      // Verify 32 couple pairs with bidirectional partner linkage
      const couplePodPartners = new Set<string>();
      for (const seat of coupleSeats) {
        expect(seat.isCouple).toBe(true);
        expect(seat.couplePartnerId).not.toBeNull();
        couplePodPartners.add(seat.couplePartnerId);
      }
      expect(couplePodPartners.size).toBe(64); // Each partner is referenced

      // Verify pricing model matches specification
      // Standard: ₦7,000 (700000 kobo), Accessible: ₦7,000, VIP: ₦9,500 (950000 kobo), Couple: ₦6,000 per seat (600000 kobo)
      expect(accessibleSeats[0].priceKobo).toBe(700000);
      expect(standardSeats[0].priceKobo).toBe(700000);
      expect(vipSeats[0].priceKobo).toBe(950000);
      expect(coupleSeats[0].priceKobo).toBe(600000);

      // Verify occupancy:
      // Confirmed tickets: E7, E8 -> OCCUPIED
      // Refunded restricted: L7 -> OCCUPIED
      // Cancelled: F1 -> AVAILABLE
      const seatE7 = data.seats.find((s: any) => s.seatNumber === 'E7');
      const seatE8 = data.seats.find((s: any) => s.seatNumber === 'E8');
      const seatL7 = data.seats.find((s: any) => s.seatNumber === 'L7');
      const seatF1 = data.seats.find((s: any) => s.seatNumber === 'F1');

      expect(seatE7.status).toBe('OCCUPIED');
      expect(seatE8.status).toBe('OCCUPIED');
      expect(seatL7.status).toBe('OCCUPIED');
      expect(seatF1.status).toBe('AVAILABLE');

      expect(data.occupiedSeats).toBe(3);
      expect(data.availableSeats).toBe(317);

      // Verify PII is stripped
      for (const seat of data.seats) {
        expect(seat).not.toHaveProperty('userId');
        expect(seat).not.toHaveProperty('bookingId');
        expect(seat).not.toHaveProperty('customerEmail');
      }
    });

    it('returns empty inventory cleanly for auditorium with zero physical seats', async (ctx) => {
      if (!liveDiscoveryTestsEnabled) {
        ctx.skip();
      }
      const res = await testRequest(app, {
        method: 'GET',
        url: '/api/v1/showtimes/st-dune-genesis-1600/seats',
      });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      const data = res.body.data;

      expect(data.showtimeId).toBe('st-dune-genesis-1600');
      expect(data.auditorium.hasConfiguredSeats).toBe(false);
      expect(data.totalSeats).toBe(0);
      expect(data.availableSeats).toBe(0);
      expect(data.occupiedSeats).toBe(0);
      expect(data.seats).toEqual([]);
    });

    it('returns 404 for non-existent showtime', async (ctx) => {
      if (!liveDiscoveryTestsEnabled) {
        ctx.skip();
      }
      const res = await testRequest(app, {
        method: 'GET',
        url: '/api/v1/showtimes/st-non-existent-id/seats',
      });

      expect(res.status).toBe(404);
      expect(res.body.status).toBe('error');
      expect(res.body.code).toBe('SHOWTIME_NOT_FOUND');
    });
  });
});
