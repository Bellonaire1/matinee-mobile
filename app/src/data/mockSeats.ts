export type SeatTier = 'standard' | 'vip' | 'couple' | 'accessible';
export type SeatStatus = 'available' | 'held' | 'sold';

export interface SeatModel {
  id: string; // e.g. "G-8"
  row: string; // "A" - "V"
  col: number; // 1 - 16
  displayLabel: string; // e.g. "G8"
  tier: SeatTier;
  status: SeatStatus;
  isAccessible: boolean;
  isCouple: boolean;
  couplePartnerId?: string; // id of paired couple seat in pod
  priceKobo: number; // minor units (kobo): 100 kobo = 1 NGN
}

export interface SeatRowModel {
  row: string;
  tier: SeatTier;
  tierLabel: string;
  seats: SeatModel[];
}

export interface AuditoriumLayout {
  hallName: string;
  totalSeats: number;
  rows: SeatRowModel[];
  seatsById: Record<string, SeatModel>;
  tierPricing: Record<SeatTier, number>;
  couplePairPriceKobo: number;
}

// Convert kobo (minor unit) to formatted Nigerian Naira (NGN)
export function formatKoboToNgn(kobo: number): string {
  const naira = Math.round(kobo / 100);
  return `₦${naira.toLocaleString()}`;
}

// Approved default base ticket price: Standard admission = ₦7,000 (700,000 kobo)
export const APPROVED_BASE_PRICE_KOBO = 700000;

// Approved presentation string for showtime starting admission: "Seats from ₦7,000"
export const APPROVED_SHOWTIME_PRICE_LABEL = `Seats from ${formatKoboToNgn(APPROVED_BASE_PRICE_KOBO)}`;

// Approved presentation string for movie details ticket price: "From ₦7,000"
export const APPROVED_MOVIE_STARTING_PRICE = `From ${formatKoboToNgn(APPROVED_BASE_PRICE_KOBO)}`;

// Formats showtime starting price from any base kobo (defaults to approved base: ₦7,000)
export function getShowtimeStartingPriceLabel(baseKobo: number = APPROVED_BASE_PRICE_KOBO): string {
  return `Seats from ${formatKoboToNgn(baseKobo)}`;
}

// Generates a verified auditorium layout containing exactly 320 unique seats (20 rows x 16 columns)
export function generateAuditoriumLayout(basePriceKobo: number = APPROVED_BASE_PRICE_KOBO): AuditoriumLayout {
  // Tier pricing in kobo:
  // Standard base: ₦7,000 = 700,000 kobo
  // Accessible: same as standard (₦7,000 = 700,000 kobo)
  // VIP Recliner: ₦9,500 = 950,000 kobo
  // Couple Lounger: ₦12,000 per 2-seat pair pod (stored as ₦6,000 = 600,000 kobo per individual seat)
  const vipPriceKobo = Math.round((basePriceKobo * 95) / 70); // ₦9,500 for ₦7,000 base
  const couplePairPriceKobo = Math.round((basePriceKobo * 120) / 70); // ₦12,000 pair for ₦7,000 base
  const coupleIndividualSeatKobo = Math.round(couplePairPriceKobo / 2); // ₦6,000 per individual seat

  const tierPricing: Record<SeatTier, number> = {
    standard: basePriceKobo,
    accessible: basePriceKobo,
    vip: vipPriceKobo,
    couple: coupleIndividualSeatKobo, // ₦6,000 per individual seat in pod
  };

  // 20 Rows from Front (A) to Back (V)
  const rowLetters = [
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K',
    'L', 'M', 'N', 'P', 'Q', 'R', 'S', 'T', 'U', 'V',
  ];

  // Concrete test fixtures for sold and held seat states:
  // Sold seats across tiers including standard, VIP, accessible, and couple pods
  const soldSeatIds = new Set([
    // Row A Accessible sold
    'A-15',
    // Rows B-J Standard sold (10 seats)
    'E-7', 'E-8', 'E-9', 'E-10',
    'F-8', 'F-9',
    'H-7', 'H-8',
    'J-1', 'J-2',
    // Rows K-R VIP sold (8 seats)
    'L-7', 'L-8', 'L-9', 'L-10',
    'M-8', 'M-9',
    'Q-8', 'Q-9',
    // Rows S-V Couple sold (1 complete pair S-7 & S-8, plus one orphaned partner U-3)
    'S-7', 'S-8',
    'U-3',
  ]);

  // Held seats across tiers
  const heldSeatIds = new Set([
    // Standard held (2 seats)
    'G-7', 'G-8',
    // VIP held (4 seats)
    'M-6', 'M-7',
    'P-9', 'P-10',
    // Couple held (1 complete pair T-5 & T-6, plus one orphaned partner V-11)
    'T-5', 'T-6',
    'V-11',
  ]);

  const rows: SeatRowModel[] = [];
  const seatsById: Record<string, SeatModel> = {};
  let totalSeats = 0;

  rowLetters.forEach((rowLetter, rowIndex) => {
    let rowTier: SeatTier = 'standard';
    let rowTierLabel = 'Standard';

    if (rowLetter === 'A') {
      rowTier = 'accessible';
      rowTierLabel = 'Accessible & Front';
    } else if (rowIndex >= 1 && rowIndex <= 8) {
      // Rows B, C, D, E, F, G, H, J (8 rows): Standard
      rowTier = 'standard';
      rowTierLabel = 'Standard';
    } else if (rowIndex >= 9 && rowIndex <= 15) {
      // Rows K, L, M, N, P, Q, R (7 rows): VIP Recliner
      rowTier = 'vip';
      rowTierLabel = 'VIP Recliner';
    } else {
      // Rows S, T, U, V (4 rows): Couple Lounger
      rowTier = 'couple';
      rowTierLabel = 'Couple Lounger';
    }

    const rowSeats: SeatModel[] = [];

    // 16 seats per row: [1..4] [Aisle] [5..12] [Aisle] [13..16]
    for (let col = 1; col <= 16; col++) {
      const id = `${rowLetter}-${col}`;

      // Wheelchair allocation: exactly 4 seats at the outer edges of Row A
      const isAccessible = rowLetter === 'A' && (col === 1 || col === 2 || col === 15 || col === 16);
      const isCouple = rowTier === 'couple';

      // Couple seats pair adjacent columns (1-2, 3-4, 5-6, 7-8, etc.)
      let couplePartnerId: string | undefined;
      if (isCouple) {
        couplePartnerId = col % 2 === 1 ? `${rowLetter}-${col + 1}` : `${rowLetter}-${col - 1}`;
      }

      // Determine effective tier for seat
      let effectiveTier: SeatTier = rowTier;
      if (rowLetter === 'A') {
        effectiveTier = isAccessible ? 'accessible' : 'standard';
      }

      let status: SeatStatus = 'available';
      if (soldSeatIds.has(id)) {
        status = 'sold';
      } else if (heldSeatIds.has(id)) {
        status = 'held';
      }

      const priceKobo = tierPricing[effectiveTier];

      const seat: SeatModel = {
        id,
        row: rowLetter,
        col,
        displayLabel: `${rowLetter}${col}`,
        tier: effectiveTier,
        status,
        isAccessible,
        isCouple,
        couplePartnerId,
        priceKobo,
      };

      rowSeats.push(seat);
      seatsById[id] = seat;
      totalSeats++;
    }

    rows.push({
      row: rowLetter,
      tier: rowTier,
      tierLabel: rowTierLabel,
      seats: rowSeats,
    });
  });

  return {
    hallName: 'Screen 1 (Laser IMAX & Recliners)',
    totalSeats,
    rows,
    seatsById,
    tierPricing,
    couplePairPriceKobo,
  };
}
