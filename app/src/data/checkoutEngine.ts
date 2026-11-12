import { SeatModel, SeatTier, formatKoboToNgn } from './mockSeats';
import {
  calculateSelectionTotals,
  validateSelectionInvariants,
  DEFAULT_MAX_SEATS_PER_BOOKING,
  SelectionTotals,
} from './seatSelectionEngine';
import { Movie, getMovieById } from './mockMovies';
import { Cinema, ShowtimeSlot, LAGOS_CINEMAS } from './mockCinemas';

export const CHECKOUT_DEMO_DISCLAIMER =
  'Demo Checkout Preview — No seats are reserved and no payment will be processed.';

export const CHECKOUT_DEMO_SUBTEXT =
  'Matinee is currently in mobile preview mode. Live seat holds, payment gateway integration, and digital QR ticket issuance will be added in upcoming modules.';

export type DemoCheckoutState = 'none' | 'pending' | 'failed' | 'expired';

export interface TierItemizedReceipt {
  tier: SeatTier;
  label: string;
  count: number;
  pricePerSeatKobo: number;
  subtotalKobo: number;
  formattedPricePerSeat: string;
  formattedSubtotal: string;
}

export interface CheckoutValidationInput {
  movieId?: string | null;
  cinemaId?: string | null;
  showtimeId?: string | null;
  seatIds?: string | string[] | Set<string> | null;
}

export type CheckoutErrorCode =
  | 'MISSING_MOVIE'
  | 'INVALID_MOVIE'
  | 'MISSING_CINEMA'
  | 'INVALID_CINEMA'
  | 'MISSING_SHOWTIME'
  | 'INVALID_SHOWTIME'
  | 'EMPTY_SEAT_SELECTION'
  | 'INVALID_SEATS';

export interface CheckoutValidationSuccess {
  isValid: true;
  movie: Movie;
  cinema: Cinema;
  showtime: ShowtimeSlot;
  auditoriumName: string;
  selectedSeatIds: string[];
  selectionTotals: SelectionTotals;
  tierReceipts: TierItemizedReceipt[];
  totalKobo: number;
  formattedTotal: string;
}

export interface CheckoutValidationFailure {
  isValid: false;
  errorCode: CheckoutErrorCode;
  errorMessage: string;
  movie?: Movie;
  cinema?: Cinema;
}

export type CheckoutValidationResult =
  | CheckoutValidationSuccess
  | CheckoutValidationFailure;

const TIER_DISPLAY_NAMES: Record<SeatTier, string> = {
  standard: 'Standard Seat',
  vip: 'VIP Prime',
  couple: 'Couple Pod (Individual)',
  accessible: 'Wheelchair Accessible',
};

/**
 * Parses raw seatIds input from URL params or array into a normalized array of trimmed strings.
 */
export function parseSeatIdsParam(rawSeatIds?: string | string[] | Set<string> | null): string[] {
  if (!rawSeatIds) return [];
  if (rawSeatIds instanceof Set) return Array.from(rawSeatIds);
  if (Array.isArray(rawSeatIds)) return rawSeatIds.map((s) => s.trim()).filter(Boolean);
  if (typeof rawSeatIds === 'string') {
    return rawSeatIds
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * Builds itemized tier breakdown receipts from selection totals.
 */
export function buildTierReceipts(
  totals: SelectionTotals,
  seatsById: Record<string, SeatModel>
): TierItemizedReceipt[] {
  const tiers: SeatTier[] = ['standard', 'vip', 'couple', 'accessible'];
  const receipts: TierItemizedReceipt[] = [];

  for (const tier of tiers) {
    const count = totals.countsByTier[tier] || 0;
    if (count > 0) {
      const subtotalKobo = totals.totalsByTierKobo[tier] || 0;
      // Derive price per seat from first matched seat of this tier
      const sampleSeat = totals.selectedSeats.find((s) => s.tier === tier);
      const pricePerSeatKobo = sampleSeat ? sampleSeat.priceKobo : Math.round(subtotalKobo / count);

      receipts.push({
        tier,
        label: TIER_DISPLAY_NAMES[tier],
        count,
        pricePerSeatKobo,
        subtotalKobo,
        formattedPricePerSeat: formatKoboToNgn(pricePerSeatKobo),
        formattedSubtotal: formatKoboToNgn(subtotalKobo),
      });
    }
  }

  return receipts;
}

/**
 * Validates checkout navigation parameters and recalculates selection totals purely.
 * Never trusts any amount passed from route query parameters.
 */
export function validateCheckoutContext(
  input: CheckoutValidationInput,
  seatsById: Record<string, SeatModel>,
  auditoriumName: string = 'Auditorium 1 (IMAX Laser)',
  maxSeats: number = DEFAULT_MAX_SEATS_PER_BOOKING
): CheckoutValidationResult {
  // 1. Movie Validation
  if (!input.movieId) {
    return {
      isValid: false,
      errorCode: 'MISSING_MOVIE',
      errorMessage: 'Movie parameter is missing from the checkout session.',
    };
  }

  const movie = getMovieById(input.movieId);
  if (!movie) {
    return {
      isValid: false,
      errorCode: 'INVALID_MOVIE',
      errorMessage: `Movie ID "${input.movieId}" was not found in the catalog.`,
    };
  }

  // 2. Cinema Validation
  if (!input.cinemaId) {
    return {
      isValid: false,
      errorCode: 'MISSING_CINEMA',
      errorMessage: 'Cinema parameter is missing from the checkout session.',
      movie,
    };
  }

  const cinema = LAGOS_CINEMAS.find((c) => c.id === input.cinemaId);
  if (!cinema) {
    return {
      isValid: false,
      errorCode: 'INVALID_CINEMA',
      errorMessage: `Cinema ID "${input.cinemaId}" was not found in registered cinemas.`,
      movie,
    };
  }

  // 3. Showtime Validation
  if (!input.showtimeId) {
    return {
      isValid: false,
      errorCode: 'MISSING_SHOWTIME',
      errorMessage: 'Showtime slot parameter is missing from the checkout session.',
      movie,
      cinema,
    };
  }

  const showtimeSlots = cinema.showtimesByMovie[movie.id] || [];
  const showtime = showtimeSlots.find((s) => s.id === input.showtimeId);
  if (!showtime) {
    return {
      isValid: false,
      errorCode: 'INVALID_SHOWTIME',
      errorMessage: `Showtime slot "${input.showtimeId}" is not available for ${movie.title} at ${cinema.name}.`,
      movie,
      cinema,
    };
  }

  // 4. Seat Selection Validation
  const seatIds = parseSeatIdsParam(input.seatIds);
  if (seatIds.length === 0) {
    return {
      isValid: false,
      errorCode: 'EMPTY_SEAT_SELECTION',
      errorMessage: 'No seats have been selected. Please select at least 1 seat to preview checkout.',
      movie,
      cinema,
    };
  }

  const seatIdSet = new Set(seatIds);
  const invariantCheck = validateSelectionInvariants(seatIdSet, seatsById, maxSeats);

  if (!invariantCheck.isValid) {
    return {
      isValid: false,
      errorCode: 'INVALID_SEATS',
      errorMessage: invariantCheck.errors.join(' '),
      movie,
      cinema,
    };
  }

  // 5. Recalculate totals strictly from auditorium domain model
  const selectionTotals = calculateSelectionTotals(seatIdSet, seatsById);
  const tierReceipts = buildTierReceipts(selectionTotals, seatsById);

  return {
    isValid: true,
    movie,
    cinema,
    showtime,
    auditoriumName,
    selectedSeatIds: seatIds,
    selectionTotals,
    tierReceipts,
    totalKobo: selectionTotals.totalKobo,
    formattedTotal: selectionTotals.formattedTotal,
  };
}

export interface DemoStateMetadata {
  id: DemoCheckoutState;
  title: string;
  badgeLabel: string;
  iconName: 'time-outline' | 'alert-circle-outline' | 'hourglass-outline';
  iconColor: string;
  description: string;
  explanation: string;
  suggestedActionLabel: string;
  secondaryActionLabel: string;
}

export const DEMO_CHECKOUT_STATES: Record<Exclude<DemoCheckoutState, 'none'>, DemoStateMetadata> = {
  pending: {
    id: 'pending',
    title: 'Payment Verification Pending',
    badgeLabel: 'Demo State — Non-Transactional',
    iconName: 'hourglass-outline',
    iconColor: '#F6BE63', // Warning Amber
    description: 'Simulating transaction settlement check with payment gateway.',
    explanation:
      'In production, Matinee subscribes to real-time webhook confirmation from the payment provider (Paystack / Flutterwave). No real transaction was initiated, and no payment card was charged.',
    suggestedActionLabel: 'Simulate Another State',
    secondaryActionLabel: 'Return to Checkout Preview',
  },
  failed: {
    id: 'failed',
    title: 'Payment Authorization Failed',
    badgeLabel: 'Demo State — Non-Transactional',
    iconName: 'alert-circle-outline',
    iconColor: '#F44336', // Error Red
    description: 'Simulated issuer decline: 3DS challenge timeout or insufficient balance.',
    explanation:
      'This state demonstrates how Matinee presents card declines or bank network timeouts to the customer. No payment attempt was processed and no funds were debited.',
    suggestedActionLabel: 'Try Payment Again (Demo)',
    secondaryActionLabel: 'Return to Seat Selection',
  },
  expired: {
    id: 'expired',
    title: 'Seat Selection Expired',
    badgeLabel: 'Demo State — Non-Transactional',
    iconName: 'time-outline',
    iconColor: '#B78AF7', // Secondary Lavender
    description: 'The simulated seat reservation window (10:00) has elapsed.',
    explanation:
      'In production, temporary Redis seat holds automatically expire if payment is not finalized within the 10-minute timeout window. This prevents seats from being locked indefinitely.',
    suggestedActionLabel: 'Re-select Seats in Map',
    secondaryActionLabel: 'Back to Showtimes',
  },
};

