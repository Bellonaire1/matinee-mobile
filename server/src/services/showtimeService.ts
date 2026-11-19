import { ScreenFormat, SeatTier, ShowtimeStatus, TicketStatus } from '@prisma/client';
import prisma from '../db.js';
import { AppError } from '../middleware/errorHandler.js';

export type SeatInventoryStatus = 'AVAILABLE' | 'OCCUPIED';

export interface SeatInventoryItem {
  id: string;
  seatNumber: string;
  row: string;
  column: number;
  tier: SeatTier;
  isAccessible: boolean;
  isCouple: boolean;
  couplePartnerId: string | null;
  status: SeatInventoryStatus;
  priceKobo: number;
}

export interface ShowtimeSeatInventory {
  showtimeId: string;
  status: ShowtimeStatus;
  startTime: string;
  endTime: string;
  format: ScreenFormat;
  movie: {
    id: string;
    title: string;
    ageRating: string;
    runtime: number;
  };
  cinema: {
    id: string;
    name: string;
  };
  auditorium: {
    id: string;
    name: string;
    screenNumber: number;
    hasConfiguredSeats: boolean;
  };
  pricing: {
    basePriceKobo: number;
    vipPriceKobo: number;
    couplePairPriceKobo: number;
    accessiblePriceKobo: number;
  };
  totalSeats: number;
  availableSeats: number;
  occupiedSeats: number;
  seats: SeatInventoryItem[];
}

export class ShowtimeService {
  /**
   * Retrieves full physical seat inventory and real-time occupancy status for a showtime.
   *
   * BUSINESS INVARIANTS:
   * 1. Active ticket allocations (PENDING_PAYMENT, CONFIRMED, CHECKED_IN, REFUNDED_RESTRICTED)
   *    are marked as OCCUPIED.
   * 2. Released tickets (CANCELLED, REFUNDED_RELEASED) remain AVAILABLE.
   * 3. No artificial HELD state is asserted until a dedicated Redis hold engine is provisioned.
   * 4. Empty auditoriums cleanly return empty seat arrays with totalSeats=0.
   * 5. No customer names, emails, payment tokens, or booking references are exposed.
   */
  async getShowtimeSeatInventory(showtimeId: string): Promise<ShowtimeSeatInventory> {
    // 1. Fetch showtime with auditorium, cinema, and movie metadata
    const showtime = await prisma.showtime.findUnique({
      where: { id: showtimeId },
      include: {
        movie: {
          select: {
            id: true,
            title: true,
            ageRating: true,
            runtime: true,
          },
        },
        auditorium: {
          include: {
            cinema: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!showtime) {
      throw new AppError(`Showtime with ID '${showtimeId}' not found`, 404, 'SHOWTIME_NOT_FOUND');
    }

    // 2. Query physical seats for this auditorium in deterministic reading order (row asc, column asc)
    const physicalSeats = await prisma.seat.findMany({
      where: {
        auditoriumId: showtime.auditoriumId,
        isActive: true,
      },
      orderBy: [
        { row: 'asc' },
        { column: 'asc' },
      ],
    });

    // 3. Query active occupied tickets for this specific showtime
    // Strictly bounds query to only seatId and status (never exposes customer or transaction details)
    const activeAllocations = await prisma.ticket.findMany({
      where: {
        showtimeId,
        status: {
          in: [
            TicketStatus.PENDING_PAYMENT,
            TicketStatus.CONFIRMED,
            TicketStatus.CHECKED_IN,
            TicketStatus.REFUNDED_RESTRICTED,
          ],
        },
      },
      select: {
        seatId: true,
        status: true,
      },
    });

    const occupiedSeatIds = new Set(activeAllocations.map((a) => a.seatId));

    // 4. Map each physical seat to inventory item with accurate tier pricing
    const seats: SeatInventoryItem[] = physicalSeats.map((seat) => {
      let priceKobo = showtime.basePriceKobo; // Default Standard: ₦7,000

      if (seat.tier === SeatTier.ACCESSIBLE) {
        priceKobo = showtime.accessiblePriceKobo; // ₦7,000
      } else if (seat.tier === SeatTier.VIP) {
        priceKobo = showtime.vipPriceKobo; // ₦9,500
      } else if (seat.tier === SeatTier.COUPLE) {
        // Individual partner seat in couple pod: ₦6,000 (pod total is ₦12,000)
        priceKobo = Math.round(showtime.couplePairPriceKobo / 2);
      }

      const isOccupied = occupiedSeatIds.has(seat.id);

      return {
        id: seat.id,
        seatNumber: seat.seatNumber,
        row: seat.row,
        column: seat.column,
        tier: seat.tier,
        isAccessible: seat.isAccessible,
        isCouple: seat.isCouple,
        couplePartnerId: seat.couplePartnerId,
        status: isOccupied ? 'OCCUPIED' : 'AVAILABLE',
        priceKobo,
      };
    });

    const totalSeats = physicalSeats.length;
    const occupiedSeats = seats.filter((s) => s.status === 'OCCUPIED').length;
    const availableSeats = totalSeats - occupiedSeats;

    return {
      showtimeId: showtime.id,
      status: showtime.status,
      startTime: showtime.startTime.toISOString(),
      endTime: showtime.endTime.toISOString(),
      format: showtime.format,
      movie: {
        id: showtime.movie.id,
        title: showtime.movie.title,
        ageRating: showtime.movie.ageRating,
        runtime: showtime.movie.runtime,
      },
      cinema: {
        id: showtime.auditorium.cinema.id,
        name: showtime.auditorium.cinema.name,
      },
      auditorium: {
        id: showtime.auditorium.id,
        name: showtime.auditorium.name,
        screenNumber: showtime.auditorium.screenNumber,
        hasConfiguredSeats: totalSeats > 0,
      },
      pricing: {
        basePriceKobo: showtime.basePriceKobo,
        vipPriceKobo: showtime.vipPriceKobo,
        couplePairPriceKobo: showtime.couplePairPriceKobo,
        accessiblePriceKobo: showtime.accessiblePriceKobo,
      },
      totalSeats,
      availableSeats,
      occupiedSeats,
      seats,
    };
  }
}

export const showtimeService = new ShowtimeService();
export default showtimeService;
