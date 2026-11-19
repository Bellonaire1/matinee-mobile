import { describe, it, expect, vi, beforeEach } from 'vitest';
import { app } from '../src/app.js';
import { testRequest } from './helpers/testRequest.js';
import { prisma } from '../src/db.js';
import { ScreenFormat, SeatTier, ShowtimeStatus, TicketStatus } from '@prisma/client';

describe('Showtimes API (/api/v1/showtimes)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/v1/showtimes/:id/seats', () => {
    const mockShowtime = {
      id: 'st-dune-lekki-1430',
      auditoriumId: 'aud-lekki-imax-01',
      movieId: 'mov-dune-part-two',
      startTime: new Date('2026-11-20T14:30:00.000Z'),
      endTime: new Date('2026-11-20T17:16:00.000Z'),
      format: ScreenFormat.IMAX_LASER,
      status: ShowtimeStatus.OPEN_FOR_BOOKING,
      basePriceKobo: 700000,
      vipPriceKobo: 950000,
      couplePairPriceKobo: 1200000,
      accessiblePriceKobo: 700000,
      movie: {
        id: 'mov-dune-part-two',
        title: 'Dune: Part Two',
        ageRating: '16',
        runtime: 166,
      },
      auditorium: {
        id: 'aud-lekki-imax-01',
        name: 'Screen 1 (IMAX)',
        screenNumber: 1,
        cinema: {
          id: 'cin-filmhouse-lekki',
          name: 'Filmhouse Cinemas IMAX',
        },
      },
    };

    it('returns 200 with full seat inventory, accurate tier pricing, and couple partner IDs', async () => {
      const mockSeats = [
        {
          id: 'seat-a1',
          auditoriumId: 'aud-lekki-imax-01',
          row: 'A',
          column: 1,
          seatNumber: 'A1',
          tier: SeatTier.ACCESSIBLE,
          isAccessible: true,
          isCouple: false,
          couplePartnerId: null,
          isActive: true,
        },
        {
          id: 'seat-b1',
          auditoriumId: 'aud-lekki-imax-01',
          row: 'B',
          column: 1,
          seatNumber: 'B1',
          tier: SeatTier.STANDARD,
          isAccessible: false,
          isCouple: false,
          couplePartnerId: null,
          isActive: true,
        },
        {
          id: 'seat-k1',
          auditoriumId: 'aud-lekki-imax-01',
          row: 'K',
          column: 1,
          seatNumber: 'K1',
          tier: SeatTier.VIP,
          isAccessible: false,
          isCouple: false,
          couplePartnerId: null,
          isActive: true,
        },
        {
          id: 'seat-s1',
          auditoriumId: 'aud-lekki-imax-01',
          row: 'S',
          column: 1,
          seatNumber: 'S1',
          tier: SeatTier.COUPLE,
          isAccessible: false,
          isCouple: true,
          couplePartnerId: 'seat-s2',
          isActive: true,
        },
        {
          id: 'seat-s2',
          auditoriumId: 'aud-lekki-imax-01',
          row: 'S',
          column: 2,
          seatNumber: 'S2',
          tier: SeatTier.COUPLE,
          isAccessible: false,
          isCouple: true,
          couplePartnerId: 'seat-s1',
          isActive: true,
        },
      ];

      const mockTickets = [
        {
          seatId: 'seat-b1',
          status: TicketStatus.CONFIRMED,
        },
      ];

      vi.spyOn(prisma.showtime, 'findUnique').mockResolvedValue(mockShowtime as any);
      vi.spyOn(prisma.seat, 'findMany').mockResolvedValue(mockSeats as any);
      vi.spyOn(prisma.ticket, 'findMany').mockResolvedValue(mockTickets as any);

      const res = await testRequest(app, {
        method: 'GET',
        url: '/api/v1/showtimes/st-dune-lekki-1430/seats',
      });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      const data = res.body.data;

      expect(data.showtimeId).toBe('st-dune-lekki-1430');
      expect(data.movie.title).toBe('Dune: Part Two');
      expect(data.cinema.name).toBe('Filmhouse Cinemas IMAX');
      expect(data.auditorium.name).toBe('Screen 1 (IMAX)');
      expect(data.auditorium.hasConfiguredSeats).toBe(true);

      expect(data.totalSeats).toBe(5);
      expect(data.occupiedSeats).toBe(1);
      expect(data.availableSeats).toBe(4);

      // Verify tier pricing
      const accessibleSeat = data.seats.find((s: any) => s.seatNumber === 'A1');
      expect(accessibleSeat.tier).toBe('ACCESSIBLE');
      expect(accessibleSeat.priceKobo).toBe(700000);
      expect(accessibleSeat.status).toBe('AVAILABLE');

      const standardSeat = data.seats.find((s: any) => s.seatNumber === 'B1');
      expect(standardSeat.tier).toBe('STANDARD');
      expect(standardSeat.priceKobo).toBe(700000);
      expect(standardSeat.status).toBe('OCCUPIED'); // B1 is confirmed

      const vipSeat = data.seats.find((s: any) => s.seatNumber === 'K1');
      expect(vipSeat.tier).toBe('VIP');
      expect(vipSeat.priceKobo).toBe(950000);
      expect(vipSeat.status).toBe('AVAILABLE');

      const coupleSeat1 = data.seats.find((s: any) => s.seatNumber === 'S1');
      expect(coupleSeat1.tier).toBe('COUPLE');
      expect(coupleSeat1.isCouple).toBe(true);
      expect(coupleSeat1.couplePartnerId).toBe('seat-s2');
      expect(coupleSeat1.priceKobo).toBe(600000); // 1,200,000 / 2
      expect(coupleSeat1.status).toBe('AVAILABLE');

      // Verify no PII is returned
      data.seats.forEach((seat: any) => {
        expect(seat).not.toHaveProperty('userId');
        expect(seat).not.toHaveProperty('bookingId');
        expect(seat).not.toHaveProperty('customerEmail');
        expect(seat).not.toHaveProperty('customerName');
        expect(seat).not.toHaveProperty('paymentReference');
      });
    });

    it('correctly maps active ticket statuses as OCCUPIED and released as AVAILABLE', async () => {
      const mockSeats = [
        { id: 's1', auditoriumId: 'aud-1', row: 'A', column: 1, seatNumber: 'A1', tier: SeatTier.STANDARD, isAccessible: false, isCouple: false, couplePartnerId: null, isActive: true },
        { id: 's2', auditoriumId: 'aud-1', row: 'A', column: 2, seatNumber: 'A2', tier: SeatTier.STANDARD, isAccessible: false, isCouple: false, couplePartnerId: null, isActive: true },
        { id: 's3', auditoriumId: 'aud-1', row: 'A', column: 3, seatNumber: 'A3', tier: SeatTier.STANDARD, isAccessible: false, isCouple: false, couplePartnerId: null, isActive: true },
        { id: 's4', auditoriumId: 'aud-1', row: 'A', column: 4, seatNumber: 'A4', tier: SeatTier.STANDARD, isAccessible: false, isCouple: false, couplePartnerId: null, isActive: true },
        { id: 's5', auditoriumId: 'aud-1', row: 'A', column: 5, seatNumber: 'A5', tier: SeatTier.STANDARD, isAccessible: false, isCouple: false, couplePartnerId: null, isActive: true },
        { id: 's6', auditoriumId: 'aud-1', row: 'A', column: 6, seatNumber: 'A6', tier: SeatTier.STANDARD, isAccessible: false, isCouple: false, couplePartnerId: null, isActive: true },
      ];

      // Active allocations: CONFIRMED, PENDING_PAYMENT, CHECKED_IN, REFUNDED_RESTRICTED
      // (CANCELLED and REFUNDED_RELEASED are excluded by prisma query in service)
      const mockTickets = [
        { seatId: 's1', status: TicketStatus.CONFIRMED },
        { seatId: 's2', status: TicketStatus.PENDING_PAYMENT },
        { seatId: 's3', status: TicketStatus.CHECKED_IN },
        { seatId: 's4', status: TicketStatus.REFUNDED_RESTRICTED },
      ];

      vi.spyOn(prisma.showtime, 'findUnique').mockResolvedValue(mockShowtime as any);
      vi.spyOn(prisma.seat, 'findMany').mockResolvedValue(mockSeats as any);
      const ticketFindSpy = vi.spyOn(prisma.ticket, 'findMany').mockResolvedValue(mockTickets as any);

      const res = await testRequest(app, {
        method: 'GET',
        url: '/api/v1/showtimes/st-dune-lekki-1430/seats',
      });

      expect(res.status).toBe(200);
      expect(ticketFindSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            showtimeId: 'st-dune-lekki-1430',
            status: {
              in: [
                TicketStatus.PENDING_PAYMENT,
                TicketStatus.CONFIRMED,
                TicketStatus.CHECKED_IN,
                TicketStatus.REFUNDED_RESTRICTED,
              ],
            },
          }),
        })
      );

      const seats = res.body.data.seats;
      expect(seats.find((s: any) => s.id === 's1').status).toBe('OCCUPIED'); // CONFIRMED
      expect(seats.find((s: any) => s.id === 's2').status).toBe('OCCUPIED'); // PENDING_PAYMENT
      expect(seats.find((s: any) => s.id === 's3').status).toBe('OCCUPIED'); // CHECKED_IN
      expect(seats.find((s: any) => s.id === 's4').status).toBe('OCCUPIED'); // REFUNDED_RESTRICTED
      expect(seats.find((s: any) => s.id === 's5').status).toBe('AVAILABLE'); // No active ticket
      expect(seats.find((s: any) => s.id === 's6').status).toBe('AVAILABLE'); // No active ticket

      expect(res.body.data.totalSeats).toBe(6);
      expect(res.body.data.occupiedSeats).toBe(4);
      expect(res.body.data.availableSeats).toBe(2);
    });

    it('returns empty inventory cleanly for auditorium with zero physical seats', async () => {
      const mockEmptyShowtime = {
        ...mockShowtime,
        id: 'st-dune-genesis-1600',
        auditoriumId: 'aud-genesis-palms-01',
        auditorium: {
          id: 'aud-genesis-palms-01',
          name: 'Screen 1',
          screenNumber: 1,
          cinema: {
            id: 'cin-genesis-palms',
            name: 'Genesis Deluxe Cinemas',
          },
        },
      };

      vi.spyOn(prisma.showtime, 'findUnique').mockResolvedValue(mockEmptyShowtime as any);
      vi.spyOn(prisma.seat, 'findMany').mockResolvedValue([]);
      vi.spyOn(prisma.ticket, 'findMany').mockResolvedValue([]);

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

    it('returns 404 when showtime does not exist', async () => {
      vi.spyOn(prisma.showtime, 'findUnique').mockResolvedValue(null);

      const res = await testRequest(app, {
        method: 'GET',
        url: '/api/v1/showtimes/st-non-existent/seats',
      });

      expect(res.status).toBe(404);
      expect(res.body.status).toBe('error');
      expect(res.body.code).toBe('SHOWTIME_NOT_FOUND');
    });
  });
});
