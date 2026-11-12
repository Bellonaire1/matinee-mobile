import { Movie, ALL_MOVIES } from './mockMovies';

export interface FilterOptions {
  query?: string;
  genre?: string;
  format?: string;
}

/**
 * Standard narrative genres for film catalog filtering.
 * Strictly separated from technical projection/auditorium formats.
 */
export const MOCK_NARRATIVE_GENRES = [
  'All',
  'Sci-Fi',
  'Action',
  'Adventure',
  'Drama',
  'Animation',
  'Thriller',
] as const;

/**
 * Technical projection and auditorium formats for Lagos cinemas.
 */
export const MOCK_TECHNICAL_FORMATS = [
  'All Formats',
  'IMAX',
  'VIP',
  'Dolby Cinema',
  '4DX',
] as const;

/**
 * Normalizes query string for robust, case-insensitive substring search.
 */
export function normalizeQuery(query?: string | null): string {
  return (query || '').trim().toLowerCase();
}

/**
 * Pure search and filter engine for catalog movies.
 * Searches across:
 * - Title
 * - Director
 * - Genres (narrative categories)
 * - Formats (projection/auditorium specs)
 * - Synopsis
 * - Cast character names and actor names
 */
export function filterMovies(
  movies: Movie[] = ALL_MOVIES,
  options: FilterOptions = {}
): Movie[] {
  const normQuery = normalizeQuery(options.query);
  const selectedGenre = (options.genre || 'All').trim();
  const selectedFormat = (options.format || 'All Formats').trim();

  return movies.filter((movie) => {
    // 1. Narrative genre filter check
    if (selectedGenre !== 'All') {
      const hasGenre = movie.genres.some(
        (g) => g.toLowerCase() === selectedGenre.toLowerCase()
      );
      if (!hasGenre) return false;
    }

    // 2. Technical format filter check
    if (selectedFormat !== 'All Formats') {
      const normFormat = selectedFormat.toLowerCase();
      const hasFormat = movie.formats.some((f) => {
        const normF = f.toLowerCase();
        return normF === normFormat || normF.includes(normFormat) || normFormat.includes(normF);
      });
      if (!hasFormat) return false;
    }

    // 3. Query search check
    if (!normQuery) return true;

    const titleMatch = movie.title.toLowerCase().includes(normQuery);
    const directorMatch = movie.director.toLowerCase().includes(normQuery);
    const synopsisMatch = movie.synopsis.toLowerCase().includes(normQuery);
    const genreMatch = movie.genres.some((g) => g.toLowerCase().includes(normQuery));
    const formatMatch = movie.formats.some((f) => f.toLowerCase().includes(normQuery));
    const castMatch = movie.cast.some(
      (c) =>
        c.name.toLowerCase().includes(normQuery) ||
        c.character.toLowerCase().includes(normQuery)
    );

    return titleMatch || directorMatch || synopsisMatch || genreMatch || formatMatch || castMatch;
  });
}

/**
 * Returns true if the movie belongs to the Coming Soon category.
 */
export function isMovieComingSoon(movie: Movie): boolean {
  return movie.category === 'coming_soon';
}

/**
 * Formats a user-visible summary string describing the search results.
 */
export function getSearchSummaryText(
  resultCount: number,
  query?: string,
  genre?: string,
  format?: string
): string {
  const normQuery = normalizeQuery(query);
  const selectedGenre = (genre || 'All').trim();
  const selectedFormat = (format || 'All Formats').trim();
  const countLabel = `${resultCount} ${resultCount === 1 ? 'film' : 'films'}`;

  const hasGenre = selectedGenre !== 'All';
  const hasFormat = selectedFormat !== 'All Formats';

  if (normQuery) {
    if (hasGenre && hasFormat) {
      return `${countLabel} found for "${normQuery}" in ${selectedGenre} (${selectedFormat})`;
    }
    if (hasGenre) {
      return `${countLabel} found for "${normQuery}" in ${selectedGenre}`;
    }
    if (hasFormat) {
      return `${countLabel} found for "${normQuery}" (${selectedFormat})`;
    }
    return `${countLabel} found for "${normQuery}"`;
  }

  if (hasGenre && hasFormat) {
    return `${countLabel} in ${selectedGenre} (${selectedFormat})`;
  }
  if (hasGenre) {
    return `${countLabel} in ${selectedGenre}`;
  }
  if (hasFormat) {
    return `${countLabel} in ${selectedFormat}`;
  }

  return `Showing all ${countLabel}`;
}

export const TICKETS_GUEST_INFO = {
  headerTitle: 'My Tickets',
  headerSubtitle: 'Digital reservations and scannable passes',
  emptyTitle: 'No Active Digital Tickets',
  emptyMessage:
    'You currently have no active cinema reservations. Matinee is in mobile preview mode — real digital tickets, scannable QR passes, and payment receipts will become available after backend and verified payment gateway integration in upcoming modules.',
  demoNoticeTitle: 'Mobile Preview Notice',
  demoNoticeMessage:
    'No real tickets, payments, or bookings exist in this build. All catalog data and seat selections are local simulations.',
  primaryActionTitle: 'Explore Now Showing Movies',
  secondaryActionTitle: 'Search Cinema Catalog',
} as const;

export const PROFILE_GUEST_INFO = {
  headerTitle: 'Profile & Settings',
  headerSubtitle: 'Manage your guest session and app preview preferences',
  guestName: 'Guest Preview User',
  guestSubtitle: 'Matinee Mobile Cinema Explorer',
  membershipBadge: 'LOCAL PREVIEW',
  appVersion: '1.0.0 (Build 2)',
  sdkVersion: 'Expo SDK ~58.0.23',
  themeDescription: 'Cinema After Dark (Obsidian & Velvet) — Only Active Theme',
  paymentDescription:
    'Not Implemented (Non-Transactional Preview — No real or sandbox payment gateway is currently connected)',
  seatEngineDescription: 'Local 320-Seat Auditorium & Approved Tier Pricing Engine',
} as const;

export const APP_SYSTEM_DIAGNOSTICS = {
  version: '1.0.0',
  build: '2',
  sdk: 'Expo SDK ~58.0.23',
  reactNative: 'React Native 0.88.1',
  react: 'React 19.3.0',
  router: 'Expo Router ~58.0.30',
  seatCount: 320,
  maxSeatsPerBooking: 8,
  tiers: ['Standard (₦7,000)', 'VIP (₦9,500)', 'Couple (₦12,000/pair)', 'Accessible (₦7,000)'],
  cinemasCount: 4,
} as const;


