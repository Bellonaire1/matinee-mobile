/**
 * Matinee Mobile Checkout API Client & Offline Demo Adapter (Milestone M05.6B)
 * =============================================================================
 * Implements two cleanly separated modes:
 *
 * Mode A: OFFLINE DEMO MODE (Active by default)
 *   - Realistic, deterministic synthetic offline engine.
 *   - No network calls to live backend or Paystack.
 *   - Enforces 600s initial hold + 300s one-time extension (strictly capped at 900s).
 *   - Manages simulated PENDING booking creation, idempotent retry, and test settlement.
 *   - Clearly labels all states as SIMULATED / DEMO.
 *
 * Mode B: FUTURE API MODE (Contract Preparation Only)
 *   - Typed API clients matching actual backend contracts:
 *       POST /api/v1/showtimes/:id/holds
 *       DELETE /api/v1/holds
 *       POST /api/v1/holds/heartbeat
 *       POST /api/v1/bookings
 *       POST /api/v1/payments/initialize
 *       GET  /api/v1/payments/status/:reference
 *   - Inactive by default (requires explicit EXPO_PUBLIC_USE_LIVE_CHECKOUT flag).
 * =============================================================================
 */

export const INITIAL_HOLD_SECONDS = 600; // 10 minutes
export const EXTENSION_HOLD_SECONDS = 300; // 5 minutes
export const MAX_HOLD_LIFETIME_SECONDS = 900; // 15 minutes absolute maximum lifetime cap
export const MAX_ALLOWED_EXTENSIONS = 1; // Strict limit: at most 1 extension

// Contract Types (Matching Server Schemas & Responses)

export interface HeldSeatItem {
  id: string;
  seatNumber: string;
  row: string;
  column: number;
  tier: string;
  priceKobo: number;
}

export interface HoldResult {
  holdToken: string;
  showtimeId: string;
  seats: HeldSeatItem[];
  totalSeats: number;
  totalPriceKobo: number;
  expiresAt: string;
  expiresInSeconds: number;
  extensionCount: number;
  isSimulated: boolean;
}

export interface BookingTicketItem {
  id: string;
  seatId: string;
  seatNumber: string;
  tier: string;
  priceKobo: number;
  status: 'PENDING_PAYMENT' | 'CONFIRMED' | 'CANCELLED';
}

export interface BookingResult {
  id: string;
  bookingReference: string;
  showtimeId: string;
  status: 'PENDING' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED';
  totalKobo: number;
  expiresAt: string;
  tickets: BookingTicketItem[];
  isSimulated: boolean;
  idempotencyKey?: string;
}

export interface PaymentInitResult {
  paymentAttemptId: string;
  providerTransactionId: string;
  authorizationUrl: string;
  accessCode: string;
  reference: string;
  amountKobo: number;
  currency: string;
  status: 'PENDING';
  bookingReference: string;
  isSimulated: boolean;
}

export interface PaymentStatusResult {
  reference: string;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  amountKobo: number;
  currency: string;
  bookingId: string;
  bookingStatus: 'PENDING' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED';
  bookingReference: string;
  requiresRefund: boolean;
  paidAt: string | null;
  isSimulated: boolean;
  failureReason?: string;
}

// -----------------------------------------------------------------------------
// Offline Simulation Engine (In-Memory Realistic State)
// -----------------------------------------------------------------------------

interface SimulatedPaymentAttempt {
  id: string;
  reference: string;
  bookingId: string;
  amountKobo: number;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  paidAt: string | null;
  failureReason?: string;
}

class SimulatedCheckoutEngine {
  private activeHolds: Map<string, {
    token: string;
    showtimeId: string;
    seatIds: string[];
    seats: HeldSeatItem[];
    totalPriceKobo: number;
    createdAtMs: number;
    expiresAtMs: number;
    extensionCount: number;
  }> = new Map();

  private activeBookings: Map<string, BookingResult> = new Map();
  private idempotencyRegistry: Map<string, BookingResult> = new Map();
  private paymentAttemptsByReference: Map<string, SimulatedPaymentAttempt> = new Map();

  /**
   * Simulates acquiring an atomic seat hold (POST /api/v1/showtimes/:id/holds).
   */
  async acquireHold(
    showtimeId: string,
    seatIds: string[],
    seats: HeldSeatItem[],
    totalPriceKobo: number
  ): Promise<HoldResult> {
    const now = Date.now();
    const holdToken = `sim_hold_tok_${Math.random().toString(36).substring(2, 12)}_${now}`;
    const expiresAtMs = now + INITIAL_HOLD_SECONDS * 1000;

    const record = {
      token: holdToken,
      showtimeId,
      seatIds,
      seats,
      totalPriceKobo,
      createdAtMs: now,
      expiresAtMs,
      extensionCount: 0,
    };

    this.activeHolds.set(holdToken, record);

    return {
      holdToken,
      showtimeId,
      seats,
      totalSeats: seats.length,
      totalPriceKobo,
      expiresAt: new Date(expiresAtMs).toISOString(),
      expiresInSeconds: INITIAL_HOLD_SECONDS,
      extensionCount: 0,
      isSimulated: true,
    };
  }

  /**
   * Simulates extending a seat hold window (POST /api/v1/holds/heartbeat).
   * Enforces 600s + 300s, max 900s total lifetime.
   */
  async extendHold(holdToken: string): Promise<{
    success: boolean;
    expiresInSeconds: number;
    expiresAt: string;
    extensionCount: number;
    message: string;
  }> {
    const hold = this.activeHolds.get(holdToken);
    if (!hold) {
      throw new Error('Hold session not found or already released');
    }

    const now = Date.now();
    if (now >= hold.expiresAtMs) {
      this.activeHolds.delete(holdToken);
      throw new Error('Hold session has already expired');
    }

    if (hold.extensionCount >= MAX_ALLOWED_EXTENSIONS) {
      throw new Error('Hold has already reached the maximum allowed extension limit (1 extension)');
    }

    const maxExpiryMs = hold.createdAtMs + MAX_HOLD_LIFETIME_SECONDS * 1000;
    const proposedExpiryMs = hold.expiresAtMs + EXTENSION_HOLD_SECONDS * 1000;
    const finalExpiryMs = Math.min(proposedExpiryMs, maxExpiryMs);

    hold.expiresAtMs = finalExpiryMs;
    hold.extensionCount += 1;

    const remainingSec = Math.max(0, Math.floor((finalExpiryMs - now) / 1000));

    return {
      success: true,
      expiresInSeconds: remainingSec,
      expiresAt: new Date(finalExpiryMs).toISOString(),
      extensionCount: hold.extensionCount,
      message: 'Hold extended by up to 300 seconds (capped at 900s total)',
    };
  }

  /**
   * Simulates releasing an active hold (DELETE /api/v1/holds).
   */
  async releaseHold(holdToken: string): Promise<boolean> {
    return this.activeHolds.delete(holdToken);
  }

  /**
   * Simulates transactional booking initialization (POST /api/v1/bookings).
   * Invariant: Idempotent retries using the same idempotencyKey return the identical booking.
   */
  async createBooking(params: {
    showtimeId: string;
    seatIds: string[];
    contactEmail: string;
    contactName?: string;
    totalPriceKobo: number;
    holdToken: string;
    idempotencyKey: string;
  }): Promise<BookingResult> {
    const { holdToken, idempotencyKey, showtimeId, seatIds, totalPriceKobo } = params;

    // Check Idempotency Cache
    const existing = this.idempotencyRegistry.get(idempotencyKey);
    if (existing) {
      return existing; // Return identical booking representation on idempotent retry!
    }

    const hold = this.activeHolds.get(holdToken);
    if (!hold) {
      throw new Error('Hold session not found or already released. Cannot create booking.');
    }

    const now = Date.now();
    if (now >= hold.expiresAtMs) {
      this.activeHolds.delete(holdToken);
      throw new Error('Hold session has expired. Please re-select your seats.');
    }

    const bookingId = `sim_bkg_${Math.random().toString(36).substring(2, 10)}`;
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    const bookingReference = `SIM-MAT-${dateStr}-${randSuffix}`;

    const tickets: BookingTicketItem[] = hold.seats.map((s, idx) => ({
      id: `sim_tkt_${idx}_${s.id}`,
      seatId: s.id,
      seatNumber: s.seatNumber,
      tier: s.tier,
      priceKobo: s.priceKobo,
      status: 'PENDING_PAYMENT',
    }));

    const booking: BookingResult = {
      id: bookingId,
      bookingReference,
      showtimeId,
      status: 'PENDING',
      totalKobo: totalPriceKobo,
      expiresAt: new Date(now + 600 * 1000).toISOString(),
      tickets,
      isSimulated: true,
      idempotencyKey,
    };

    this.activeBookings.set(bookingId, booking);
    this.idempotencyRegistry.set(idempotencyKey, booking);

    // Upon booking creation, temporary hold is released into pending order
    this.activeHolds.delete(holdToken);

    return booking;
  }

  /**
   * Simulates payment initialization (POST /api/v1/payments/initialize).
   */
  async initializePayment(params: {
    bookingId: string;
    email?: string;
    holdToken?: string;
  }): Promise<PaymentInitResult> {
    const booking = this.activeBookings.get(params.bookingId);
    if (!booking) {
      throw new Error(`Booking order not found for id: ${params.bookingId}`);
    }

    const reference = `SIM-PAY-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const paymentAttemptId = `sim_pay_${Math.random().toString(36).substring(2, 8)}`;

    const attempt: SimulatedPaymentAttempt = {
      id: paymentAttemptId,
      reference,
      bookingId: booking.id,
      amountKobo: booking.totalKobo,
      status: 'PENDING',
      paidAt: null,
    };
    this.paymentAttemptsByReference.set(reference, attempt);

    return {
      paymentAttemptId,
      providerTransactionId: reference,
      authorizationUrl: `urn:matinee:offline-test-checkout:${reference}`,
      accessCode: `sim_ac_${reference}`,
      reference,
      amountKobo: booking.totalKobo,
      currency: 'NGN',
      status: 'PENDING',
      bookingReference: booking.bookingReference,
      isSimulated: true,
    };
  }

  /**
   * Simulates payment status inquiry (GET /api/v1/payments/status/:reference).
   * Resolves exact payment reference -> payment attempt -> booking.
   */
  async getPaymentStatus(params: {
    reference: string;
    outcome?: 'succeeded' | 'failed' | 'pending';
  }): Promise<PaymentStatusResult> {
    const attempt = this.paymentAttemptsByReference.get(params.reference);
    if (!attempt) {
      throw new Error(`Payment reference not found: ${params.reference}`);
    }

    const booking = this.activeBookings.get(attempt.bookingId);
    if (!booking) {
      throw new Error(`Associated booking not found for reference: ${params.reference}`);
    }

    const requestedOutcome = params.outcome || 'succeeded';

    // If attempt is still pending, update its status according to the requested outcome
    if (attempt.status === 'PENDING') {
      if (requestedOutcome === 'succeeded') {
        attempt.status = 'SUCCEEDED';
        attempt.paidAt = new Date().toISOString();
        booking.status = 'CONFIRMED';
        booking.tickets.forEach((t) => (t.status = 'CONFIRMED'));
      } else if (requestedOutcome === 'failed') {
        attempt.status = 'FAILED';
        attempt.failureReason = 'Simulated card declined by issuing bank';
        // Note: Booking and tickets stay in existing PENDING state and are NOT confirmed!
      }
    }

    return {
      reference: attempt.reference,
      status: attempt.status,
      amountKobo: attempt.amountKobo,
      currency: 'NGN',
      bookingId: booking.id,
      bookingStatus: booking.status,
      bookingReference: booking.bookingReference,
      requiresRefund: false,
      paidAt: attempt.paidAt,
      isSimulated: true,
      failureReason: attempt.failureReason,
    };
  }
}

export const simulatedCheckoutEngine = new SimulatedCheckoutEngine();

// -----------------------------------------------------------------------------
// Environment-Gated Staging Mode & Real API Adapter (Milestone M05.13)
// -----------------------------------------------------------------------------

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || 'https://matinee-staging-api.onrender.com/api/v1';

export const IS_LIVE_CHECKOUT_ENABLED =
  process.env.EXPO_PUBLIC_USE_LIVE_CHECKOUT?.trim().toLowerCase() === 'true' ||
  Boolean(process.env.EXPO_PUBLIC_API_URL?.includes('matinee-staging-api.onrender.com'));

export class ApiError extends Error {
  code?: string;
  status: number;
  data?: any;

  constructor(message: string, status: number, code?: string, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

export async function apiAcquireHold(
  showtimeId: string,
  seatIds: string[],
  idempotencyKey?: string
): Promise<HoldResult> {
  const url = `${API_BASE_URL}/showtimes/${encodeURIComponent(showtimeId)}/holds`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: JSON.stringify({ seatIds }),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    const code = errBody.code || errBody.error?.code || 'HOLD_FAILED';
    const message = errBody.message || errBody.error?.message || `Hold acquisition failed with HTTP ${response.status}`;
    throw new ApiError(message, response.status, code, errBody);
  }

  const json = await response.json();
  const data = json.data;
  return {
    holdToken: data.holdToken,
    showtimeId: data.showtimeId,
    seats: data.seats || [],
    totalSeats: data.totalSeats || (data.seats ? data.seats.length : seatIds.length),
    totalPriceKobo: data.totalPriceKobo || 0,
    expiresAt: data.expiresAt,
    expiresInSeconds: data.expiresInSeconds || INITIAL_HOLD_SECONDS,
    extensionCount: data.extensionCount || 0,
    isSimulated: false,
  };
}

export async function apiGetHold(holdToken: string): Promise<HoldResult> {
  const url = `${API_BASE_URL}/holds`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'X-Hold-Token': holdToken,
    },
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    const code = errBody.code || errBody.error?.code || 'GET_HOLD_FAILED';
    const message = errBody.message || `Hold lookup failed with HTTP ${response.status}`;
    throw new ApiError(message, response.status, code, errBody);
  }

  const json = await response.json();
  const data = json.data;
  return {
    holdToken: data.holdToken || holdToken,
    showtimeId: data.showtimeId,
    seats: data.seats || [],
    totalSeats: data.totalSeats || (data.seats ? data.seats.length : 0),
    totalPriceKobo: data.totalPriceKobo || 0,
    expiresAt: data.expiresAt,
    expiresInSeconds: data.expiresInSeconds || 0,
    extensionCount: data.extensionCount || 0,
    isSimulated: false,
  };
}

export async function apiReleaseHold(
  holdToken: string
): Promise<{ releasedSeatsCount: number; message: string }> {
  const url = `${API_BASE_URL}/holds`;
  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      Accept: 'application/json',
      'X-Hold-Token': holdToken,
    },
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    const code = errBody.code || 'RELEASE_HOLD_FAILED';
    const message = errBody.message || `Hold release failed with HTTP ${response.status}`;
    throw new ApiError(message, response.status, code, errBody);
  }

  const json = await response.json();
  return json.data || { releasedSeatsCount: 0, message: 'Hold released' };
}

export async function apiHeartbeatHold(
  holdToken: string
): Promise<{ holdToken: string; expiresInSeconds: number; extensionCount: number; message: string }> {
  const url = `${API_BASE_URL}/holds/heartbeat`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'X-Hold-Token': holdToken,
    },
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    const code = errBody.code || 'HEARTBEAT_FAILED';
    const message = errBody.message || `Hold extension failed with HTTP ${response.status}`;
    throw new ApiError(message, response.status, code, errBody);
  }

  const json = await response.json();
  const data = json.data;
  return {
    holdToken: data.holdToken || holdToken,
    expiresInSeconds: data.expiresInSeconds || EXTENSION_HOLD_SECONDS,
    extensionCount: data.extensionCount || 1,
    message: data.message || 'Hold successfully extended by 5 minutes',
  };
}

export async function apiCreateBooking(params: {
  showtimeId: string;
  seatIds: string[];
  contactEmail: string;
  contactName?: string;
  contactPhone?: string;
  totalPriceKobo?: number;
  holdToken: string;
  idempotencyKey: string;
}): Promise<BookingResult> {
  const url = `${API_BASE_URL}/bookings`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Idempotency-Key': params.idempotencyKey,
      'X-Hold-Token': params.holdToken,
    },
    body: JSON.stringify({
      showtimeId: params.showtimeId,
      seatIds: params.seatIds,
      contactEmail: params.contactEmail,
      contactName: params.contactName,
      contactPhone: params.contactPhone,
      totalPriceKobo: params.totalPriceKobo,
    }),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    const code = errBody.code || errBody.error?.code || 'BOOKING_FAILED';
    const message = errBody.message || errBody.error?.message || `Booking creation failed with HTTP ${response.status}`;
    throw new ApiError(message, response.status, code, errBody);
  }

  const json = await response.json();
  const data = json.data;
  const tickets: BookingTicketItem[] = (data.tickets || []).map((t: any) => ({
    id: t.id,
    seatId: t.seatId,
    seatNumber: t.seatNumber || (t.ticketCode ? t.ticketCode.split('-')[2] : t.seatId),
    tier: t.tier,
    priceKobo: t.priceKobo,
    status: t.status,
  }));

  return {
    id: data.id,
    bookingReference: data.bookingReference,
    showtimeId: data.showtimeId,
    status: data.status,
    totalKobo: data.totalKobo,
    expiresAt: data.expiresAt || '',
    tickets,
    isSimulated: false,
    idempotencyKey: params.idempotencyKey,
  };
}

let lastSessionBooking: BookingResult | null = null;
export function getLastSessionBooking(): BookingResult | null {
  return lastSessionBooking;
}
export function setLastSessionBooking(booking: BookingResult | null): void {
  lastSessionBooking = booking;
}

export async function apiInitializePayment(params: {
  bookingId: string;
  holdToken?: string;
  email?: string;
}): Promise<PaymentInitResult> {
  if (!IS_LIVE_CHECKOUT_ENABLED) {
    throw new Error('Live checkout API is inactive in offline demo mode');
  }

  const response = await fetch(`${API_BASE_URL}/payments/initialize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(params.holdToken ? { 'X-Hold-Token': params.holdToken } : {}),
    },
    body: JSON.stringify({
      bookingId: params.bookingId,
      email: params.email,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || `Payment initialization failed with status ${response.status}`);
  }

  const data = await response.json();
  return { ...data.data, isSimulated: false };
}

export async function apiGetPaymentStatus(params: {
  reference: string;
  holdToken?: string;
}): Promise<PaymentStatusResult> {
  if (!IS_LIVE_CHECKOUT_ENABLED) {
    throw new Error('Live checkout API is inactive in offline demo mode');
  }

  const response = await fetch(`${API_BASE_URL}/payments/status/${encodeURIComponent(params.reference)}`, {
    method: 'GET',
    headers: {
      ...(params.holdToken ? { 'X-Hold-Token': params.holdToken } : {}),
    },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || `Payment status check failed with status ${response.status}`);
  }

  const data = await response.json();
  return { ...data.data, isSimulated: false };
}
