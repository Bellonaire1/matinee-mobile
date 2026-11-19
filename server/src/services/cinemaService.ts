import { Prisma, ShowtimeStatus } from '@prisma/client';
import prisma from '../db.js';
import { AppError } from '../middleware/errorHandler.js';
import { ListCinemasQuery, GetCinemaShowtimesQuery } from '../schemas/cinemaSchemas.js';

export interface CinemaWithAuditoriumCount {
  id: string;
  name: string;
  chain: string | null;
  neighborhood: string;
  address: string;
  city: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  features: string[];
  auditoriumCount: number;
}

export interface FormattedShowtime {
  id: string;
  showtimeId: string;
  movie: {
    id: string;
    title: string;
    posterUrl: string | null;
    ageRating: string;
    runtime: number;
    genres: string[];
  };
  auditorium: {
    id: string;
    name: string;
    screenNumber: number;
  };
  startTime: string;
  endTime: string;
  format: string;
  pricing: {
    basePriceKobo: number;
    vipPriceKobo: number;
    couplePairPriceKobo: number;
    accessiblePriceKobo: number;
  };
  status: ShowtimeStatus;
  isBookable: boolean;
  bookingWindowStatus: 'OPEN' | 'OPENS_SOON' | 'CLOSED';
}

export class CinemaService {
  async listCinemas(query: ListCinemasQuery): Promise<CinemaWithAuditoriumCount[]> {
    const where: Prisma.CinemaWhereInput = {};

    if (query.city) {
      where.city = { equals: query.city, mode: 'insensitive' };
    }

    if (query.neighborhood) {
      where.neighborhood = { contains: query.neighborhood, mode: 'insensitive' };
    }

    const cinemas = await prisma.cinema.findMany({
      where,
      include: {
        _count: {
          select: { auditoriums: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return cinemas.map((c) => ({
      id: c.id,
      name: c.name,
      chain: c.chain,
      neighborhood: c.neighborhood,
      address: c.address,
      city: c.city,
      country: c.country,
      latitude: c.latitude,
      longitude: c.longitude,
      features: c.features,
      auditoriumCount: c._count.auditoriums,
    }));
  }

  async getCinemaShowtimes(
    cinemaId: string,
    query: GetCinemaShowtimesQuery
  ): Promise<FormattedShowtime[]> {
    // 1. Verify cinema existence
    const cinema = await prisma.cinema.findUnique({
      where: { id: cinemaId },
    });

    if (!cinema) {
      throw new AppError(`Cinema with ID '${cinemaId}' not found`, 404, 'CINEMA_NOT_FOUND');
    }

    // 2. Build showtime filter
    const where: Prisma.ShowtimeWhereInput = {
      auditorium: {
        cinemaId,
      },
      status: {
        in: [ShowtimeStatus.SCHEDULED, ShowtimeStatus.OPEN_FOR_BOOKING],
      },
    };

    if (query.movieId) {
      where.movieId = query.movieId;
    }

    if (query.date) {
      // Cinema-local date boundaries for Lagos (Africa/Lagos, UTC+1 / West Africa Time)
      const startOfDay = new Date(`${query.date}T00:00:00.000+01:00`);
      const endOfDay = new Date(`${query.date}T23:59:59.999+01:00`);
      where.startTime = {
        gte: startOfDay,
        lte: endOfDay,
      };
    }

    const showtimes = await prisma.showtime.findMany({
      where,
      include: {
        movie: true,
        auditorium: true,
      },
      orderBy: { startTime: 'asc' },
    });

    const now = new Date();

    return showtimes.map((st) => {
      const isFuture = new Date(st.startTime) > now;
      const isBookable = st.status === ShowtimeStatus.OPEN_FOR_BOOKING && isFuture;
      const bookingWindowStatus = isBookable
        ? 'OPEN'
        : st.status === ShowtimeStatus.SCHEDULED && isFuture
        ? 'OPENS_SOON'
        : 'CLOSED';

      return {
        id: st.id,
        showtimeId: st.id,
        movie: {
          id: st.movie.id,
          title: st.movie.title,
          posterUrl: st.movie.posterUrl,
          ageRating: st.movie.ageRating,
          runtime: st.movie.runtime,
          genres: st.movie.genres,
        },
        auditorium: {
          id: st.auditorium.id,
          name: st.auditorium.name,
          screenNumber: st.auditorium.screenNumber,
        },
        startTime: st.startTime.toISOString(),
        endTime: st.endTime.toISOString(),
        format: st.format,
        pricing: {
          basePriceKobo: st.basePriceKobo,
          vipPriceKobo: st.vipPriceKobo,
          couplePairPriceKobo: st.couplePairPriceKobo,
          accessiblePriceKobo: st.accessiblePriceKobo,
        },
        status: st.status,
        isBookable,
        bookingWindowStatus,
      };
    });
  }
}

export const cinemaService = new CinemaService();
export default cinemaService;
