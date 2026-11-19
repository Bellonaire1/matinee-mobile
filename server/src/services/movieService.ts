import { Movie, MovieCategory, Prisma } from '@prisma/client';
import prisma from '../db.js';
import { AppError } from '../middleware/errorHandler.js';
import { ListMoviesQuery } from '../schemas/movieSchemas.js';
import tmdbService, { TMDB_ATTRIBUTION } from './tmdbService.js';

export interface EnrichedMovie extends Movie {
  attribution?: string;
  tmdb?: {
    tmdbId: number;
    tagline: string | null;
    rating: number;
    votesCount: number;
    posterUrl: string | null;
    backdropUrl: string | null;
    director: string | null;
    cast: any[];
    attribution: string;
  };
}

export interface PaginatedMoviesResult {
  movies: (Movie | EnrichedMovie)[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export class MovieService {
  async listMovies(query: ListMoviesQuery): Promise<PaginatedMoviesResult> {
    const { category, genre, search, page, limit } = query;

    const where: Prisma.MovieWhereInput = {
      isActive: true,
    };

    if (category) {
      where.category = category as MovieCategory;
    }

    if (genre) {
      where.genres = {
        has: genre,
      };
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { synopsis: { contains: search, mode: 'insensitive' } },
        { director: { contains: search, mode: 'insensitive' } },
      ];
    }

    const total = await prisma.movie.count({ where });
    const totalPages = Math.ceil(total / limit) || 1;
    const skip = (page - 1) * limit;

    const movies = await prisma.movie.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    // Safely enhance with cached TMDB data if available; fallback to DB record
    const enrichedMovies: (Movie | EnrichedMovie)[] = await Promise.all(
      movies.map(async (movie) => {
        if (!movie.tmdbId) return movie;
        try {
          const tmdbData = await tmdbService.getMovieDetails(movie.tmdbId);
          if (tmdbData) {
            return {
              ...movie,
              posterUrl: tmdbData.posterUrl || movie.posterUrl,
              backdropUrl: tmdbData.backdropUrl || movie.backdropUrl,
              attribution: TMDB_ATTRIBUTION,
            };
          }
        } catch {
          // Graceful fallback to pristine DB record
        }
        return movie;
      })
    );

    return {
      movies: enrichedMovies,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  async getMovieById(id: string): Promise<Movie | EnrichedMovie> {
    const movie = await prisma.movie.findUnique({
      where: { id },
    });

    if (!movie || !movie.isActive) {
      throw new AppError(`Movie with ID '${id}' not found`, 404, 'MOVIE_NOT_FOUND');
    }

    if (movie.tmdbId) {
      try {
        const tmdbData = await tmdbService.getMovieDetails(movie.tmdbId);
        if (tmdbData) {
          return {
            ...movie,
            posterUrl: tmdbData.posterUrl || movie.posterUrl,
            backdropUrl: tmdbData.backdropUrl || movie.backdropUrl,
            director: movie.director || tmdbData.director,
            cast: movie.cast || (tmdbData.cast as any),
            tagline: movie.tagline || tmdbData.tagline,
            attribution: TMDB_ATTRIBUTION,
            tmdb: {
              tmdbId: tmdbData.tmdbId,
              tagline: tmdbData.tagline,
              rating: tmdbData.rating,
              votesCount: tmdbData.votesCount,
              posterUrl: tmdbData.posterUrl,
              backdropUrl: tmdbData.backdropUrl,
              director: tmdbData.director,
              cast: tmdbData.cast,
              attribution: TMDB_ATTRIBUTION,
            },
          };
        }
      } catch (err: any) {
        // Fallback: Preserve pristine database record during upstream failure
        console.warn(`[MovieService] TMDB lookup fallback for movie ${id}: ${err.message}`);
      }
    }

    return movie;
  }
}

export const movieService = new MovieService();
export default movieService;
