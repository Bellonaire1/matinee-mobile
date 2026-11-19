import { env } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';

export const TMDB_ATTRIBUTION = 'This product uses the TMDB API but is not endorsed or certified by TMDB.';

/**
 * Cache abstraction interface for future Redis / distributed cache integration.
 */
export interface ICacheService {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
}

/**
 * In-memory fallback cache implementation for development and testing.
 */
export class InMemoryCacheService implements ICacheService {
  private cache = new Map<string, { value: any; expiresAt: number }>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async del(key: string): Promise<void> {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }
}

export interface TmdbCastMember {
  id: string;
  name: string;
  character: string;
  avatarUrl: string | null;
}

export interface MappedMovieDetails {
  tmdbId: number;
  title: string;
  tagline: string | null;
  synopsis: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  runtime: number;
  ageRating: string;
  releaseYear: number;
  releaseDate: string | null;
  genres: string[];
  rating: number;
  votesCount: number;
  director: string | null;
  cast: TmdbCastMember[];
  attribution: string;
}

export class TmdbService {
  private cache: ICacheService;
  private readonly baseUrl: string;
  private readonly imageBaseUrl: string;
  private readonly timeoutMs: number;

  constructor(
    cache: ICacheService = new InMemoryCacheService(),
    baseUrl: string = env.TMDB_BASE_URL,
    imageBaseUrl: string = env.TMDB_IMAGE_BASE_URL,
    timeoutMs: number = 5000
  ) {
    this.cache = cache;
    this.baseUrl = baseUrl;
    this.imageBaseUrl = imageBaseUrl;
    this.timeoutMs = timeoutMs;
  }

  /**
   * Generates authorization headers for TMDB API requests.
   * Prefers Bearer token (TMDB v4) if configured; otherwise appends v3 API key.
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'Matinee-Backend-API/1.0',
    };

    if (env.TMDB_ACCESS_TOKEN && env.TMDB_ACCESS_TOKEN !== 'placeholder_tmdb_access_token') {
      headers['Authorization'] = `Bearer ${env.TMDB_ACCESS_TOKEN}`;
    }

    return headers;
  }

  /**
   * Dispatches an HTTP request with bounded timeout and rate-limit retry logic.
   */
  async fetchWithRetry(url: string, retryCount: number = 0): Promise<any> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle 429 Rate Limiting with 1 bounded backoff retry
      if (response.status === 429 && retryCount < 1) {
        const retryAfterHeader = response.headers.get('retry-after');
        const delayMs = retryAfterHeader ? Math.min(parseInt(retryAfterHeader, 10) * 1000, 1500) : 1000;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return this.fetchWithRetry(url, retryCount + 1);
      }

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new AppError(
          `TMDB upstream returned status ${response.status}: ${response.statusText}`,
          502,
          'TMDB_UPSTREAM_ERROR'
        );
      }

      return await response.json();
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new AppError('TMDB upstream request timed out', 504, 'TMDB_TIMEOUT');
      }
      throw err;
    }
  }

  /**
   * Fetches film details and credits by TMDB ID, mapping them to Matinee catalog structure.
   */
  async getMovieDetails(tmdbId: number): Promise<MappedMovieDetails | null> {
    const cacheKey = `tmdb:movie:${tmdbId}`;
    const cached = await this.cache.get<MappedMovieDetails>(cacheKey);
    if (cached) {
      return cached;
    }

    // Check if TMDB credentials are configured or placeholders
    const isMockOrPlaceholder =
      (!env.TMDB_API_KEY || env.TMDB_API_KEY.includes('placeholder')) &&
      (!env.TMDB_ACCESS_TOKEN || env.TMDB_ACCESS_TOKEN.includes('placeholder'));

    if (isMockOrPlaceholder) {
      // In development without real TMDB credentials, return a safe fallback structure
      return null;
    }

    try {
      const url = `${this.baseUrl}/movie/${tmdbId}?append_to_response=credits`;
      const data = await this.fetchWithRetry(url);

      if (!data) {
        return null;
      }

      // Extract director from credits
      const crew = data.credits?.crew || [];
      const directorEntry = crew.find((c: any) => c.job === 'Director');
      const director = directorEntry ? directorEntry.name : null;

      // Extract top 10 cast members with profile images
      const rawCast = data.credits?.cast || [];
      const cast: TmdbCastMember[] = rawCast.slice(0, 10).map((c: any) => ({
        id: String(c.id),
        name: c.name,
        character: c.character || '',
        avatarUrl: c.profile_path ? `${this.imageBaseUrl}/w185${c.profile_path}` : null,
      }));

      const mapped: MappedMovieDetails = {
        tmdbId: data.id,
        title: data.title,
        tagline: data.tagline || null,
        synopsis: data.overview || '',
        posterUrl: data.poster_path ? `${this.imageBaseUrl}/w500${data.poster_path}` : null,
        backdropUrl: data.backdrop_path ? `${this.imageBaseUrl}/w1280${data.backdrop_path}` : null,
        runtime: data.runtime || 0,
        ageRating: data.adult ? '18' : 'PG-13',
        releaseYear: data.release_date ? new Date(data.release_date).getFullYear() : 2024,
        releaseDate: data.release_date || null,
        genres: (data.genres || []).map((g: any) => g.name),
        rating: data.vote_average ? Math.round(data.vote_average * 10) / 10 : 0,
        votesCount: data.vote_count || 0,
        director,
        cast,
        attribution: TMDB_ATTRIBUTION,
      };

      // Cache for 24 hours (86,400 seconds)
      await this.cache.set(cacheKey, mapped, 86400);

      return mapped;
    } catch (err: any) {
      // Graceful fallback: do not crash application if upstream TMDB fails
      console.warn(`[TMDB Proxy] Upstream request failed for tmdbId ${tmdbId}: ${err.message}`);
      return null;
    }
  }

  getAttribution(): string {
    return TMDB_ATTRIBUTION;
  }
}

export const tmdbService = new TmdbService();
export default tmdbService;
