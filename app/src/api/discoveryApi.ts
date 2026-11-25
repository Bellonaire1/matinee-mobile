/**
 * Matinee Discovery API Client & Adapter
 * =============================================================================
 * Connects the mobile frontend to the Matinee Backend Discovery API (M05.3).
 *
 * SAFETY & INVARIANT RULES:
 * 1. Safe Fallback: If EXPO_PUBLIC_USE_LIVE_API is disabled, or if the backend
 *    is unreachable, offline, or returns an unseeded empty catalog, the client
 *    gracefully falls back to the verified mock dataset.
 * 2. Honest Attribution: Clearly distinguishes live backend data from synthetic
 *    mock data via the `source` indicator ('live' vs 'mock_fallback').
 * 3. 320-Seat & Pricing Agreement: Respects the approved base starting price
 *    (APPROVED_MOVIE_STARTING_PRICE = "From ₦7,000") and ticket models.
 * =============================================================================
 */

import {
  Movie,
  ALL_MOVIES,
  MOCK_NOW_SHOWING_MOVIES,
  MOCK_COMING_SOON_MOVIES,
  getMovieById as getMockMovieById,
} from '../data/mockMovies';
import { APPROVED_MOVIE_STARTING_PRICE } from '../data/mockSeats';
import {
  Cinema,
  ShowtimeSlot,
  LAGOS_CINEMAS,
} from '../data/mockCinemas';

// Backend Response Types
export interface BackendMovie {
  id: string;
  tmdbId?: number | null;
  title: string;
  tagline?: string | null;
  synopsis: string;
  posterUrl?: string | null;
  backdropUrl?: string | null;
  runtime: number;
  ageRating: string;
  releaseYear: number;
  releaseDate?: string | null;
  language?: string;
  genres: string[];
  formats: string[];
  rating?: number | null;
  votesCount?: number;
  director?: string | null;
  cast?: Array<{ id: string; name: string; character: string; avatarUrl?: string | null }> | null;
  category: 'NOW_SHOWING' | 'COMING_SOON' | 'TRENDING';
  isActive: boolean;
  attribution?: string;
}

export interface BackendCinema {
  id: string;
  name: string;
  chain?: string | null;
  neighborhood: string;
  address: string;
  city: string;
  country: string;
  latitude?: number | null;
  longitude?: number | null;
  features: string[];
  auditoriumCount: number;
}

export interface BackendShowtime {
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
  status: 'SCHEDULED' | 'OPEN_FOR_BOOKING' | 'CANCELLED' | 'COMPLETED';
  isBookable: boolean;
  bookingWindowStatus: 'OPEN' | 'OPENS_SOON' | 'CLOSED';
}

export interface DiscoveryResponse<T> {
  data: T;
  source: 'live' | 'mock_fallback';
  fallbackReason?: string;
  attribution?: string;
}

// Configuration & Feature Flags
const DEFAULT_API_BASE_URL = 'https://matinee-staging-api.onrender.com/api/v1';
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || DEFAULT_API_BASE_URL;

// Presentation-only artwork for the seeded staging benchmark movie. The API
// intentionally owns the real movie ID and booking data; this fills only null
// artwork fields until staging metadata is populated.
export const STAGING_DUNE_ARTWORK = {
  posterUrl: 'https://image.tmdb.org/t/p/w500/6izwz7rsy95ARzTR3poZ8H6c5pp.jpg',
  backdropUrl: 'https://image.tmdb.org/t/p/w1280/eZ239CUp1d6OryZEBPnO2n87gMG.jpg',
};

// Feature flag: set EXPO_PUBLIC_USE_LIVE_API="true" or when EXPO_PUBLIC_API_URL is configured
export const IS_LIVE_API_ENABLED =
  process.env.EXPO_PUBLIC_USE_LIVE_API?.trim().toLowerCase() === 'true' ||
  Boolean(process.env.EXPO_PUBLIC_API_URL);

const REQUEST_TIMEOUT_MS = 3500;

/**
 * Maps a BackendMovie into the mobile UI's Movie format.
 */
export function mapBackendMovieToUiMovie(bm: BackendMovie): Movie {
  const presentationArtwork =
    bm.id === 'mov-staging-dune' ? STAGING_DUNE_ARTWORK : undefined;

  return {
    id: bm.id,
    title: bm.title,
    tagline: bm.tagline || '',
    synopsis: bm.synopsis,
    posterUrl: bm.posterUrl || presentationArtwork?.posterUrl || '',
    backdropUrl: bm.backdropUrl || presentationArtwork?.backdropUrl || '',
    rating: bm.rating ? Number(bm.rating) : 8.5,
    votes: bm.votesCount ? `${bm.votesCount.toLocaleString()} votes` : '1.2k votes',
    runtime: `${bm.runtime}m`,
    ageRating: bm.ageRating,
    releaseYear: String(bm.releaseYear),
    language: bm.language || 'English',
    genres: bm.genres || [],
    formats: bm.formats || ['Standard 2D', 'IMAX'],
    releaseDate: bm.releaseDate ? bm.releaseDate.split('T')[0] : '2024-03-01',
    director: bm.director || 'Director',
    cast: (bm.cast || []).map((c, idx) => ({
      id: c.id || `cast-${idx}`,
      name: c.name,
      character: c.character,
      avatarUrl: c.avatarUrl || '',
    })),
    category:
      bm.category === 'COMING_SOON'
        ? 'coming_soon'
        : bm.category === 'TRENDING'
        ? 'trending'
        : 'now_showing',
    priceRange: APPROVED_MOVIE_STARTING_PRICE,
  };
}

/**
 * Fetch with timeout guard.
 */
async function fetchWithTimeout(url: string, timeoutMs: number = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Matinee-Mobile-Client/1.0',
      },
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(id);
  }
}

/**
 * Movie Discovery API Service
 */
export const discoveryApi = {
  /**
   * Fetches movies from the backend with safe fallback to mock catalog.
   */
  async getMovies(options: {
    category?: 'now_showing' | 'coming_soon' | 'trending';
    genre?: string;
    search?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<DiscoveryResponse<Movie[]>> {
    if (!IS_LIVE_API_ENABLED) {
      return {
        data:
          options.category === 'coming_soon'
            ? MOCK_COMING_SOON_MOVIES
            : options.category === 'now_showing'
            ? MOCK_NOW_SHOWING_MOVIES
            : ALL_MOVIES,
        source: 'mock_fallback',
        fallbackReason: 'Live API feature flag is disabled (EXPO_PUBLIC_USE_LIVE_API != true)',
      };
    }

    try {
      const queryParams = new URLSearchParams();
      if (options.category) queryParams.set('category', options.category.toUpperCase());
      if (options.genre && options.genre !== 'All') queryParams.set('genre', options.genre);
      if (options.search) queryParams.set('search', options.search);
      if (options.page) queryParams.set('page', String(options.page));
      if (options.limit) queryParams.set('limit', String(options.limit));

      const url = `${API_BASE_URL}/movies?${queryParams.toString()}`;
      const response = await fetchWithTimeout(url);

      if (!response.ok) {
        throw new Error(`Backend returned status ${response.status}`);
      }

      const body = await response.json();
      const backendMovies: BackendMovie[] = body.data || [];

      // If backend database is unseeded/empty, fall back to mock data safely
      if (backendMovies.length === 0) {
        return {
          data:
            options.category === 'coming_soon'
              ? MOCK_COMING_SOON_MOVIES
              : options.category === 'now_showing'
              ? MOCK_NOW_SHOWING_MOVIES
              : ALL_MOVIES,
          source: 'mock_fallback',
          fallbackReason: 'Backend returned 0 catalog movies (database currently empty)',
        };
      }

      return {
        data: backendMovies.map(mapBackendMovieToUiMovie),
        source: 'live',
        attribution: backendMovies[0]?.attribution,
      };
    } catch (err: any) {
      console.warn(`[DiscoveryApi] Network call failed: ${err.message}. Using mock catalog.`);
      return {
        data:
          options.category === 'coming_soon'
            ? MOCK_COMING_SOON_MOVIES
            : options.category === 'now_showing'
            ? MOCK_NOW_SHOWING_MOVIES
            : ALL_MOVIES,
        source: 'mock_fallback',
        fallbackReason: `Network error: ${err.message}`,
      };
    }
  },

  /**
   * Fetches a movie by ID with safe fallback.
   */
  async getMovieById(id: string): Promise<DiscoveryResponse<Movie | null>> {
    if (!IS_LIVE_API_ENABLED) {
      const mockMovie = getMockMovieById(id) || null;
      return {
        data: mockMovie,
        source: 'mock_fallback',
        fallbackReason: 'Live API disabled',
      };
    }

    try {
      const url = `${API_BASE_URL}/movies/${encodeURIComponent(id)}`;
      const response = await fetchWithTimeout(url);

      if (response.status === 404) {
        // Fall back to mock if ID is a mock ID (e.g. 'feat-1')
        const mockMovie = getMockMovieById(id) || null;
        return {
          data: mockMovie,
          source: 'mock_fallback',
          fallbackReason: `Movie ${id} not found on backend`,
        };
      }

      if (!response.ok) {
        throw new Error(`Backend returned status ${response.status}`);
      }

      const body = await response.json();
      const backendMovie: BackendMovie = body.data;

      return {
        data: mapBackendMovieToUiMovie(backendMovie),
        source: 'live',
        attribution: backendMovie.attribution,
      };
    } catch (err: any) {
      const mockMovie = getMockMovieById(id) || null;
      return {
        data: mockMovie,
        source: 'mock_fallback',
        fallbackReason: `Network error: ${err.message}`,
      };
    }
  },

  /**
   * Fetches Lagos cinemas with safe fallback.
   */
  async getCinemas(): Promise<DiscoveryResponse<Cinema[]>> {
    if (!IS_LIVE_API_ENABLED) {
      return {
        data: LAGOS_CINEMAS,
        source: 'mock_fallback',
        fallbackReason: 'Live API disabled',
      };
    }

    try {
      const url = `${API_BASE_URL}/cinemas`;
      const response = await fetchWithTimeout(url);

      if (!response.ok) {
        throw new Error(`Backend returned status ${response.status}`);
      }

      const body = await response.json();
      const backendCinemas: BackendCinema[] = body.data || [];

      if (backendCinemas.length === 0) {
        return {
          data: LAGOS_CINEMAS,
          source: 'mock_fallback',
          fallbackReason: 'Backend returned 0 cinemas (unseeded)',
        };
      }

      const mappedCinemas: Cinema[] = backendCinemas.map((bc, idx) => ({
        id: bc.id,
        name: bc.name,
        chain: bc.chain || 'Matinee Premier',
        neighborhood: bc.neighborhood,
        address: bc.address,
        distanceKm: 2.5 + idx * 1.8,
        features: bc.features,
        showtimesByMovie: {},
      }));

      return {
        data: mappedCinemas,
        source: 'live',
      };
    } catch (err: any) {
      return {
        data: LAGOS_CINEMAS,
        source: 'mock_fallback',
        fallbackReason: `Network error: ${err.message}`,
      };
    }
  },

  /**
   * Fetches showtimes for a specific cinema and optional movie.
   */
  async getShowtimes(
    cinemaId: string,
    options: { movieId?: string; date?: string } = {}
  ): Promise<DiscoveryResponse<BackendShowtime[]>> {
    if (!IS_LIVE_API_ENABLED) {
      return {
        data: [],
        source: 'mock_fallback',
        fallbackReason: 'Live API disabled',
      };
    }

    try {
      const queryParams = new URLSearchParams();
      if (options.movieId) queryParams.set('movieId', options.movieId);
      if (options.date) queryParams.set('date', options.date);

      const qs = queryParams.toString();
      const url = `${API_BASE_URL}/cinemas/${encodeURIComponent(cinemaId)}/showtimes${qs ? `?${qs}` : ''}`;
      const response = await fetchWithTimeout(url);

      if (!response.ok) {
        throw new Error(`Backend returned status ${response.status}`);
      }

      const body = await response.json();
      return {
        data: body.data || [],
        source: 'live',
      };
    } catch (err: any) {
      return {
        data: [],
        source: 'mock_fallback',
        fallbackReason: `Network error: ${err.message}`,
      };
    }
  },

  /**
   * Fetches real seats layout and availability status for a showtime.
   */
  async getShowtimeSeats(showtimeId: string): Promise<DiscoveryResponse<any>> {
    if (!IS_LIVE_API_ENABLED) {
      return {
        data: null,
        source: 'mock_fallback',
        fallbackReason: 'Live API disabled',
      };
    }

    try {
      const url = `${API_BASE_URL}/showtimes/${encodeURIComponent(showtimeId)}/seats`;
      const response = await fetchWithTimeout(url);

      if (!response.ok) {
        throw new Error(`Backend returned status ${response.status}`);
      }

      const body = await response.json();
      return {
        data: body.data,
        source: 'live',
      };
    } catch (err: any) {
      return {
        data: null,
        source: 'mock_fallback',
        fallbackReason: `Network error: ${err.message}`,
      };
    }
  },
};

export default discoveryApi;
