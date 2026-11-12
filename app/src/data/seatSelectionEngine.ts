import { SeatModel, SeatTier, formatKoboToNgn } from './mockSeats';

export const DEFAULT_MAX_SEATS_PER_BOOKING = 8;

export type SelectionAction = 'selected' | 'deselected';

export type SelectionErrorCode =
  | 'SEAT_UNAVAILABLE'
  | 'PARTNER_UNAVAILABLE'
  | 'MAX_LIMIT_EXCEEDED';

export interface ToggleSeatSuccess {
  success: true;
  selectedIds: Set<string>;
  action: SelectionAction;
  seatsChanged: string[];
  totalKobo: number;
  formattedTotal: string;
  count: number;
}

export interface ToggleSeatFailure {
  success: false;
  error: SelectionErrorCode;
  message: string;
  selectedIds: Set<string>;
}

export type ToggleSeatResult = ToggleSeatSuccess | ToggleSeatFailure;

export interface SelectionTotals {
  count: number;
  totalKobo: number;
  formattedTotal: string;
  selectedSeats: SeatModel[];
  seatLabels: string;
  countsByTier: Record<SeatTier, number>;
  totalsByTierKobo: Record<SeatTier, number>;
}

/**
 * Calculates itemized totals and pricing for a collection of selected seat IDs.
 */
export function calculateSelectionTotals(
  selectedIds: Set<string> | string[],
  seatsById: Record<string, SeatModel>
): SelectionTotals {
  const idsArray = Array.from(selectedIds);
  const selectedSeats: SeatModel[] = [];

  const countsByTier: Record<SeatTier, number> = {
    standard: 0,
    vip: 0,
    couple: 0,
    accessible: 0,
  };

  const totalsByTierKobo: Record<SeatTier, number> = {
    standard: 0,
    vip: 0,
    couple: 0,
    accessible: 0,
  };

  let totalKobo = 0;

  for (const id of idsArray) {
    const seat = seatsById[id];
    if (seat) {
      selectedSeats.push(seat);
      totalKobo += seat.priceKobo;
      countsByTier[seat.tier] = (countsByTier[seat.tier] || 0) + 1;
      totalsByTierKobo[seat.tier] = (totalsByTierKobo[seat.tier] || 0) + seat.priceKobo;
    }
  }

  // Sort seats alphabetically by display label (e.g., A1, A2, B1, ...)
  selectedSeats.sort((a, b) => a.displayLabel.localeCompare(b.displayLabel, undefined, { numeric: true }));

  const seatLabels = selectedSeats.map((s) => s.displayLabel).join(', ');

  return {
    count: selectedSeats.length,
    totalKobo,
    formattedTotal: formatKoboToNgn(totalKobo),
    selectedSeats,
    seatLabels,
    countsByTier,
    totalsByTierKobo,
  };
}

/**
 * Pure state transition engine for seat selection.
 * Enforces:
 * - Rejection of held or sold seats
 * - Atomic couple pair selection (both seats selected together)
 * - Atomic couple pair deselection (both seats deselected together)
 * - Rejection if either partner in a couple pod is unavailable (held or sold)
 * - Strict maximum seat cap enforcement (prevents partial couple selection at max - 1)
 */
export function toggleSeatSelection(
  currentSelectedIds: Set<string>,
  seat: SeatModel,
  seatsById: Record<string, SeatModel>,
  maxSeats: number = DEFAULT_MAX_SEATS_PER_BOOKING
): ToggleSeatResult {
  const isCurrentlySelected = currentSelectedIds.has(seat.id);

  // 1. DESELECTION FLOW
  if (isCurrentlySelected) {
    const nextSet = new Set(currentSelectedIds);
    const seatsChanged: string[] = [seat.id];
    nextSet.delete(seat.id);

    // Couple Invariant: Deselecting either partner deselects both
    if (seat.isCouple && seat.couplePartnerId) {
      if (nextSet.has(seat.couplePartnerId)) {
        nextSet.delete(seat.couplePartnerId);
        seatsChanged.push(seat.couplePartnerId);
      }
    }

    const totals = calculateSelectionTotals(nextSet, seatsById);

    return {
      success: true,
      selectedIds: nextSet,
      action: 'deselected',
      seatsChanged,
      totalKobo: totals.totalKobo,
      formattedTotal: totals.formattedTotal,
      count: totals.count,
    };
  }

  // 2. SELECTION FLOW

  // Invariant: Seat itself must be available
  if (seat.status !== 'available') {
    return {
      success: false,
      error: 'SEAT_UNAVAILABLE',
      message: `Seat ${seat.displayLabel} is currently ${seat.status} and cannot be selected.`,
      selectedIds: currentSelectedIds,
    };
  }

  // Handle Couple Lounger Selection
  if (seat.isCouple) {
    if (!seat.couplePartnerId) {
      return {
        success: false,
        error: 'PARTNER_UNAVAILABLE',
        message: `Configuration error: Seat ${seat.displayLabel} is marked as couple but has no partner assigned.`,
        selectedIds: currentSelectedIds,
      };
    }

    const partnerSeat = seatsById[seat.couplePartnerId];
    if (!partnerSeat) {
      return {
        success: false,
        error: 'PARTNER_UNAVAILABLE',
        message: `Partner seat for ${seat.displayLabel} could not be located in auditorium.`,
        selectedIds: currentSelectedIds,
      };
    }

    // Invariant: Neither partner is selected if one is held or sold
    if (partnerSeat.status !== 'available') {
      return {
        success: false,
        error: 'PARTNER_UNAVAILABLE',
        message: `Couple partner seat ${partnerSeat.displayLabel} is currently ${partnerSeat.status}. Both seats in a couple pod must be available to select.`,
        selectedIds: currentSelectedIds,
      };
    }

    // Invariant: Maximum limit includes both partner seats (requires 2 available slots)
    if (currentSelectedIds.size + 2 > maxSeats) {
      return {
        success: false,
        error: 'MAX_LIMIT_EXCEEDED',
        message: `Selecting this couple pod (2 seats) would exceed the maximum limit of ${maxSeats} seats. You currently have ${currentSelectedIds.size} seat(s) selected.`,
        selectedIds: currentSelectedIds,
      };
    }

    // Atomically select both seats
    const nextSet = new Set(currentSelectedIds);
    nextSet.add(seat.id);
    nextSet.add(partnerSeat.id);

    const totals = calculateSelectionTotals(nextSet, seatsById);

    return {
      success: true,
      selectedIds: nextSet,
      action: 'selected',
      seatsChanged: [seat.id, partnerSeat.id],
      totalKobo: totals.totalKobo,
      formattedTotal: totals.formattedTotal,
      count: totals.count,
    };
  }

  // Handle Standard / VIP / Accessible Single Seat Selection
  if (currentSelectedIds.size + 1 > maxSeats) {
    return {
      success: false,
      error: 'MAX_LIMIT_EXCEEDED',
      message: `You can select a maximum of ${maxSeats} seats per reservation.`,
      selectedIds: currentSelectedIds,
    };
  }

  const nextSet = new Set(currentSelectedIds);
  nextSet.add(seat.id);

  const totals = calculateSelectionTotals(nextSet, seatsById);

  return {
    success: true,
    selectedIds: nextSet,
    action: 'selected',
    seatsChanged: [seat.id],
    totalKobo: totals.totalKobo,
    formattedTotal: totals.formattedTotal,
    count: totals.count,
  };
}

/**
 * Validates that an arbitrary set of selected seat IDs satisfies all domain invariants:
 * - No unavailable (held/sold) seats are selected
 * - Couple seats must always be selected in pairs (no orphaned couple seat)
 * - Total count does not exceed maxSeats
 */
export function validateSelectionInvariants(
  selectedIds: Set<string>,
  seatsById: Record<string, SeatModel>,
  maxSeats: number = DEFAULT_MAX_SEATS_PER_BOOKING
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (selectedIds.size > maxSeats) {
    errors.push(`Selection size (${selectedIds.size}) exceeds maximum allowed of ${maxSeats}.`);
  }

  for (const id of selectedIds) {
    const seat = seatsById[id];
    if (!seat) {
      errors.push(`Seat ID "${id}" does not exist in auditorium.`);
      continue;
    }

    if (seat.status !== 'available') {
      errors.push(`Seat ${seat.displayLabel} is selected but has status "${seat.status}".`);
    }

    if (seat.isCouple) {
      if (!seat.couplePartnerId || !selectedIds.has(seat.couplePartnerId)) {
        errors.push(`Couple seat ${seat.displayLabel} is selected without its partner.`);
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Formats seat count with verified singular/plural English noun ('1 seat' vs '2 seats').
 */
export function formatSeatCount(count: number): string {
  return `${count} ${count === 1 ? 'seat' : 'seats'}`;
}

/**
 * Formats modal summary statement with verified grammatical number.
 * e.g. "You have selected 1 seat for Dune: Part Two:"
 */
export function formatSelectionModalSubtitle(count: number, movieTitle: string): string {
  return `You have selected ${formatSeatCount(count)} for ${movieTitle}:`;
}
