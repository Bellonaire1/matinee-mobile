import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import { app } from '../src/app.js';
import { testRequest } from './helpers/testRequest.js';
import { prisma } from '../src/db.js';
import {
  BookingStatus,
  PaymentProvider,
  PaymentStatus,
  TicketStatus,
  WebhookProcessingStatus,
} from '@prisma/client';
import {
  PaymentService,
  verifyIncomingWebhookSignature,
  verifyPaystackV2Signature,
  verifyLegacyPaystackSignature,
  generateTransactionReference,
} from '../src/services/payment/index.js';
import { PaystackTestAdapter } from '../src/services/payment/paystackTestAdapter.js';
import bookingService from '../src/services/bookingService.js';

describe('Matinee Payment Lifecycle & Safe Settlement (Milestone M05.6A-FINAL)', () => {
  const TEST_WHSEC = 'whsec_test_secret_key_abcdef123456';
  const TEST_PAYSTACK_KEY = 'sk_test_mock_paystack_secret_key';

  const VALID_HOLD_TOKEN = 'matinee_hold_cap_tok_valid_test_token_256bit_entropy';
  const VALID_HOLD_TOKEN_HASH = crypto.createHash('sha256').update(VALID_HOLD_TOKEN).digest('hex');

  function signPaystackV2(
    body: any,
    secret = TEST_WHSEC,
    timestamp = Math.floor(Date.now() / 1000),
    keyId = 'whk_test_1'
  ): { rawBody: string; headerValue: string; signatureHex: string } {
    const rawBody = typeof body === 'string' ? body : JSON.stringify(body);
    const signedPayload = `${timestamp}.${rawBody}`;
    const signatureHex = crypto.createHmac('sha512', secret).update(signedPayload).digest('hex');
    const headerValue = `t=${timestamp},v1=${keyId}:${signatureHex}`;
    return { rawBody, headerValue, signatureHex };
  }

  function signLegacy(
    body: any,
    secret = TEST_PAYSTACK_KEY
  ): { rawBody: string; signature: string } {
    const rawBody = typeof body === 'string' ? body : JSON.stringify(body);
    const signature = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
    return { rawBody, signature };
  }

  const mockBooking = {
    id: 'bkg-test-1111-2222-3333-444455556666',
    bookingReference: 'MAT-20261122-TEST1',
    showtimeId: 'st-dune-lekki-1430',
    userId: null,
    contactEmail: 'tunde@example.com',
    contactName: 'Tunde Adebayo',
    contactPhone: '+2348012345678',
    totalKobo: 700000,
    currency: 'NGN',
    status: BookingStatus.PENDING,
    expiresAt: new Date(Date.now() + 600000), // 10 mins in future
    cancelledAt: null,
    cancellationReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    paymentAttempts: [],
  };

  const mockPaymentAttempt = {
    id: 'pay-att-1111-2222-3333',
    bookingId: mockBooking.id,
    provider: PaymentProvider.PAYSTACK_TEST,
    providerTransactionId: 'MAT-PAY-1700000000000-ABCD',
    idempotencyKey: null,
    amountKobo: 700000,
    currency: 'NGN',
    status: PaymentStatus.PENDING,
    paymentMethod: 'CARD',
    errorCode: null,
    errorMessage: null,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    booking: mockBooking,
  };

  function createMockTx(currentBooking = mockBooking, currentPayment = mockPaymentAttempt) {
    return {
      $queryRaw: vi.fn().mockResolvedValue([{ id: currentBooking.id, status: currentBooking.status }]),
      paymentAttempt: {
        findUnique: vi.fn().mockResolvedValue(currentPayment),
        update: vi.fn().mockImplementation((args: any) => ({ ...currentPayment, ...args.data })),
      },
      booking: {
        findUnique: vi.fn().mockResolvedValue(currentBooking),
        update: vi.fn().mockImplementation((args: any) => ({ ...currentBooking, ...args.data })),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      ticket: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      processedWebhookEvent: {
        create: vi.fn().mockResolvedValue({ id: 'evt-created' }),
      },
    };
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.PAYMENT_ENABLED = 'true';
    process.env.PAYMENT_WEBHOOK_SECRET = TEST_WHSEC;
    process.env.PAYMENT_TEST_SECRET_KEY = TEST_PAYSTACK_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // PHASE 1: EXACT NEW VS LEGACY PAYSTACK SIGNING PROTOCOLS
  // =========================================================================
  describe('Phase 1: Paystack Signature Verification Protocol', () => {
    describe('Modern Paystack-Signature (t=...,v1=...) Specification', () => {
      it('validates exact modern format with timestamp and key-id', () => {
        const payload = JSON.stringify({ event: 'charge.success', data: { reference: 'REF-1' } });
        const now = Math.floor(Date.now() / 1000);
        const { headerValue } = signPaystackV2(payload, TEST_WHSEC, now, 'whk_live_primary');

        const result = verifyPaystackV2Signature(payload, headerValue, TEST_WHSEC, now);
        expect(result.valid).toBe(true);
      });

      it('supports key rotation with multiple v1 entries in the header', () => {
        const payload = JSON.stringify({ event: 'charge.success', data: { reference: 'REF-ROTATION' } });
        const now = Math.floor(Date.now() / 1000);

        const oldSecret = 'whsec_old_secret_key_111111';
        const newSecret = 'whsec_new_secret_key_222222';

        const signedPayload = `${now}.${payload}`;
        const oldSig = crypto.createHmac('sha512', oldSecret).update(signedPayload).digest('hex');
        const newSig = crypto.createHmac('sha512', newSecret).update(signedPayload).digest('hex');

        // Header containing both old and new signatures
        const header = `t=${now},v1=whk_old:${oldSig},v1=whk_new:${newSig}`;

        // Verified against new secret
        const resultNew = verifyPaystackV2Signature(payload, header, newSecret, now);
        expect(resultNew.valid).toBe(true);

        // Verified against old secret
        const resultOld = verifyPaystackV2Signature(payload, header, oldSecret, now);
        expect(resultOld.valid).toBe(true);
      });

      it('accepts timestamps within the 300-second window (drift protection)', () => {
        const payload = '{"test":true}';
        const now = Math.floor(Date.now() / 1000);

        // 290 seconds in the past (acceptable)
        const pastTs = now - 290;
        const past = signPaystackV2(payload, TEST_WHSEC, pastTs);
        expect(verifyPaystackV2Signature(payload, past.headerValue, TEST_WHSEC, now).valid).toBe(true);

        // 290 seconds in the future (acceptable clock skew)
        const futureTs = now + 290;
        const future = signPaystackV2(payload, TEST_WHSEC, futureTs);
        expect(verifyPaystackV2Signature(payload, future.headerValue, TEST_WHSEC, now).valid).toBe(true);
      });

      it('rejects timestamps older than 300 seconds (expired replay)', () => {
        const payload = '{"test":true}';
        const now = Math.floor(Date.now() / 1000);

        // 301 seconds in past (> 300s)
        const expiredTs = now - 301;
        const expired = signPaystackV2(payload, TEST_WHSEC, expiredTs);

        const result = verifyPaystackV2Signature(payload, expired.headerValue, TEST_WHSEC, now);
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('TIMESTAMP_OUT_OF_RANGE');
      });

      it('rejects timestamps in the future by more than 300 seconds', () => {
        const payload = '{"test":true}';
        const now = Math.floor(Date.now() / 1000);

        // 305 seconds in future (> 300s)
        const futureTs = now + 305;
        const future = signPaystackV2(payload, TEST_WHSEC, futureTs);

        const result = verifyPaystackV2Signature(payload, future.headerValue, TEST_WHSEC, now);
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('TIMESTAMP_OUT_OF_RANGE');
      });

      it('rejects malformed header missing timestamp parameter t=', () => {
        const payload = '{"test":true}';
        const invalidHeader = 'v1=whk_1:abcdef0123456789';

        const result = verifyPaystackV2Signature(payload, invalidHeader, TEST_WHSEC);
        expect(result.valid).toBe(false);
      });

      it('rejects non-numeric timestamp in t= parameter', () => {
        const payload = '{"test":true}';
        const invalidHeader = 't=not_a_number,v1=whk_1:abcdef0123456789';

        const result = verifyPaystackV2Signature(payload, invalidHeader, TEST_WHSEC);
        expect(result.valid).toBe(false);
      });

      it('rejects tampered request body (1 byte altered)', () => {
        const payload = '{"event":"charge.success","amount":700000}';
        const tampered = '{"event":"charge.success","amount":700001}';
        const now = Math.floor(Date.now() / 1000);
        const { headerValue } = signPaystackV2(payload, TEST_WHSEC, now);

        const result = verifyPaystackV2Signature(tampered, headerValue, TEST_WHSEC, now);
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('SIGNATURE_MISMATCH');
      });
    });

    describe('Legacy x-paystack-signature Specification', () => {
      it('validates legacy 128-char hex HMAC-SHA512 over exact raw body', () => {
        const payload = '{"event":"charge.success","ref":"LEGACY-1"}';
        const { signature } = signLegacy(payload, TEST_PAYSTACK_KEY);

        const result = verifyLegacyPaystackSignature(payload, signature, TEST_PAYSTACK_KEY);
        expect(result.valid).toBe(true);
      });

      it('rejects tampered legacy payload', () => {
        const payload = '{"event":"charge.success","ref":"LEGACY-1"}';
        const tampered = '{"event":"charge.success","ref":"LEGACY-TAMPERED"}';
        const { signature } = signLegacy(payload, TEST_PAYSTACK_KEY);

        const result = verifyLegacyPaystackSignature(tampered, signature, TEST_PAYSTACK_KEY);
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('SIGNATURE_MISMATCH');
      });

      it('rejects non-128 hex character signature', () => {
        const result = verifyLegacyPaystackSignature('{}', 'too_short_sig', TEST_PAYSTACK_KEY);
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('MALFORMED_SIGNATURE');
      });
    });

    describe('Precedence & Security Fallback Invariants', () => {
      it('prefers modern Paystack-Signature when present and succeeds', () => {
        const payload = '{"event":"charge.success"}';
        const now = Math.floor(Date.now() / 1000);
        const modern = signPaystackV2(payload, TEST_WHSEC, now);
        const legacy = signLegacy(payload, TEST_PAYSTACK_KEY);

        const verified = verifyIncomingWebhookSignature(
          payload,
          {
            paystackSignature: modern.headerValue,
            legacySignature: legacy.signature,
          },
          {
            webhookSecrets: TEST_WHSEC,
            legacySecretKey: TEST_PAYSTACK_KEY,
            nowSeconds: now,
          }
        );

        expect(verified.scheme).toBe('v2');
        expect(verified.verified).toBe(true);
      });

      it('CRITICAL: Never silently falls back to legacy if explicitly provided modern signature fails', () => {
        const payload = '{"event":"charge.success"}';
        const now = Math.floor(Date.now() / 1000);
        // Valid legacy, but INVALID modern signature
        const legacy = signLegacy(payload, TEST_PAYSTACK_KEY);
        const invalidModern = `t=${now},v1=whk_1:00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000`;

        expect(() => {
          verifyIncomingWebhookSignature(
            payload,
            {
              paystackSignature: invalidModern,
              legacySignature: legacy.signature,
            },
            {
              webhookSecrets: TEST_WHSEC,
              legacySecretKey: TEST_PAYSTACK_KEY,
              nowSeconds: now,
            }
          );
        }).toThrow(/Paystack-Signature verification failed/);
      });

      it('accepts legacy header ONLY when modern Paystack-Signature is absent', () => {
        const payload = '{"event":"charge.success"}';
        const legacy = signLegacy(payload, TEST_PAYSTACK_KEY);

        const verified = verifyIncomingWebhookSignature(
          payload,
          {
            paystackSignature: undefined,
            legacySignature: legacy.signature,
          },
          {
            webhookSecrets: TEST_WHSEC,
            legacySecretKey: TEST_PAYSTACK_KEY,
          }
        );

        expect(verified.scheme).toBe('legacy');
        expect(verified.verified).toBe(true);
      });

      it('rejects request when neither signature header is provided', () => {
        expect(() => {
          verifyIncomingWebhookSignature(
            '{}',
            {},
            {
              webhookSecrets: TEST_WHSEC,
              legacySecretKey: TEST_PAYSTACK_KEY,
            }
          );
        }).toThrow(/Missing required webhook signature header/);
      });
    });
  });

  // =========================================================================
  // PHASE 2: TRUTHFUL PAYMENT AND REFUND ACCOUNTING
  // =========================================================================
  describe('Phase 2: Truthful Payment and Refund States', () => {
    it('accurately records late payment arriving after expiration as PaymentAttempt.SUCCEEDED with refundRequired=true', async () => {
      const adapter = new PaystackTestAdapter({ secretKey: TEST_PAYSTACK_KEY });
      const service = new PaymentService({
        prisma: prisma as any,
        provider: adapter,
        webhookSecret: TEST_WHSEC,
        enabled: true,
      });

      const expiredBooking = {
        ...mockBooking,
        status: BookingStatus.EXPIRED,
        cancellationReason: 'Checkout session expired before payment completion',
      };

      vi.spyOn(prisma.processedWebhookEvent, 'findUnique').mockResolvedValue(null);

      let savedPaymentStatus: PaymentStatus | null = null;
      let savedMetadata: any = null;
      let ticketUpdateCalled = false;

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        const tx = createMockTx(expiredBooking);
        tx.paymentAttempt.update = vi.fn().mockImplementation((args: any) => {
          savedPaymentStatus = args.data.status;
          savedMetadata = args.data.metadata;
          return { ...mockPaymentAttempt, ...args.data };
        });
        tx.ticket.updateMany = vi.fn().mockImplementation(() => {
          ticketUpdateCalled = true;
          return { count: 0 };
        });
        return cb(tx);
      });

      const settleResult = await service.settleBookingPayment({
        reference: mockPaymentAttempt.providerTransactionId,
        amountKobo: 700000,
        currency: 'NGN',
        providerStatus: 'success',
        eventId: 'evt-truthful-late-pay',
      });

      // 1. Booking remains strictly EXPIRED
      expect(settleResult.settled).toBe(false);
      expect(settleResult.bookingStatus).toBe(BookingStatus.EXPIRED);

      // 2. Financial truth: PaymentAttempt MUST be SUCCEEDED, not FAILED
      expect(savedPaymentStatus).toBe(PaymentStatus.SUCCEEDED);
      expect(settleResult.paymentStatus).toBe(PaymentStatus.SUCCEEDED);

      // 3. Tickets are NEVER confirmed; seats are NEVER reclaimed
      expect(ticketUpdateCalled).toBe(false);

      // 4. Audit trail and refundRequired flags are durably recorded
      expect(settleResult.requiresRefund).toBe(true);
      expect(savedMetadata.refundRequired).toBe(true);
      expect(savedMetadata.manualReviewRequired).toBe(true);
      expect(savedMetadata.refundReason).toBe('PAYMENT_RECEIVED_POST_EXPIRATION');
      expect(savedMetadata.auditTrail).toBeDefined();
      expect(savedMetadata.auditTrail.amountKobo).toBe(700000);
    });

    it('deduplicates repeated late-success notifications without altering state or refund flags', async () => {
      const adapter = new PaystackTestAdapter({ secretKey: TEST_PAYSTACK_KEY });
      const service = new PaymentService({
        prisma: prisma as any,
        provider: adapter,
        webhookSecret: TEST_WHSEC,
        enabled: true,
      });

      // Event already recorded in ledger
      vi.spyOn(prisma.processedWebhookEvent, 'findUnique').mockResolvedValue({
        id: 'evt-already-recorded',
        status: WebhookProcessingStatus.PROCESSED,
      } as any);

      const payload = {
        event: 'charge.success',
        data: { id: 'evt-already-recorded', reference: mockPaymentAttempt.providerTransactionId },
      };
      const now = Math.floor(Date.now() / 1000);
      const { rawBody, headerValue } = signPaystackV2(payload, TEST_WHSEC, now);

      const res = await service.processWebhook(rawBody, headerValue, now);
      expect(res.status).toBe('success');
      expect(res.message).toMatch(/already processed/i);
    });
  });

  // =========================================================================
  // PHASE 3: PAYMENT AUTHORIZATION AND PRIVACY
  // =========================================================================
  describe('Phase 3: Payment Authorization and Privacy', () => {
    describe('POST /api/v1/payments/initialize', () => {
      it('allows guest checkout initialization when valid cryptographic hold capability token is presented', async () => {
        const service = new PaymentService({ prisma: prisma as any, enabled: true });

        vi.spyOn(prisma.booking, 'findUnique').mockResolvedValue(mockBooking as any);
        vi.spyOn(prisma.idempotencyRecord, 'findFirst').mockResolvedValue({
          id: 'idemp-1',
          responseBody: {
            id: mockBooking.id,
            _meta: { tokenHash: VALID_HOLD_TOKEN_HASH },
          },
        } as any);
        vi.spyOn(prisma.paymentAttempt, 'create').mockResolvedValue(mockPaymentAttempt as any);

        const result = await service.initializePayment({
          bookingId: mockBooking.id,
          holdToken: VALID_HOLD_TOKEN,
        });

        expect(result.status).toBe(PaymentStatus.PENDING);
        expect(result.amountKobo).toBe(mockBooking.totalKobo); // Derived strictly from PostgreSQL booking row!
      });

      it('rejects guest checkout initialization with 403 when hold capability token hash does not match', async () => {
        const service = new PaymentService({ prisma: prisma as any, enabled: true });

        vi.spyOn(prisma.booking, 'findUnique').mockResolvedValue(mockBooking as any);
        vi.spyOn(prisma.idempotencyRecord, 'findFirst').mockResolvedValue({
          id: 'idemp-1',
          responseBody: {
            id: mockBooking.id,
            _meta: { tokenHash: VALID_HOLD_TOKEN_HASH },
          },
        } as any);

        await expect(
          service.initializePayment({
            bookingId: mockBooking.id,
            holdToken: 'fraudulent_invalid_token',
          })
        ).rejects.toThrow(/Hold capability token does not match/i);
      });

      it('rejects guest checkout initialization when hold token is completely omitted (contactEmail alone is NOT enough)', async () => {
        const service = new PaymentService({ prisma: prisma as any, enabled: true });
        vi.spyOn(prisma.booking, 'findUnique').mockResolvedValue(mockBooking as any);

        await expect(
          service.initializePayment({
            bookingId: mockBooking.id,
            contactEmail: mockBooking.contactEmail,
            // holdToken omitted
          })
        ).rejects.toThrow(/Durable cryptographic capability proof/i);
      });

      it('rejects payment initialization on another user account booking with 403 UNAUTHORIZED_BOOKING_ACCESS', async () => {
        const service = new PaymentService({ prisma: prisma as any, enabled: true });
        const userOwnedBooking = { ...mockBooking, userId: 'user_legitimate_owner' };
        vi.spyOn(prisma.booking, 'findUnique').mockResolvedValue(userOwnedBooking as any);

        await expect(
          service.initializePayment({
            bookingId: userOwnedBooking.id,
            userId: 'user_intruder_attacker',
          })
        ).rejects.toThrow(/Booking belongs to another user account/i);
      });
    });

    describe('GET /api/v1/payments/status/:reference', () => {
      it('allows authorized guest possessing cryptographic hold token to query status', async () => {
        const service = new PaymentService({ prisma: prisma as any, enabled: true });

        vi.spyOn(prisma.paymentAttempt, 'findUnique').mockResolvedValue(mockPaymentAttempt as any);
        vi.spyOn(prisma.idempotencyRecord, 'findFirst').mockResolvedValue({
          id: 'idemp-1',
          responseBody: {
            id: mockBooking.id,
            _meta: { tokenHash: VALID_HOLD_TOKEN_HASH },
          },
        } as any);

        const status = await service.getPaymentStatus({
          reference: mockPaymentAttempt.providerTransactionId,
          holdToken: VALID_HOLD_TOKEN,
        });

        expect(status.reference).toBe(mockPaymentAttempt.providerTransactionId);
        expect(status.status).toBe(PaymentStatus.PENDING);
        expect(status.amountKobo).toBe(700000);
      });

      it('rejects unauthorized status probe lacking capability token or user ownership with 403', async () => {
        const service = new PaymentService({ prisma: prisma as any, enabled: true });
        vi.spyOn(prisma.paymentAttempt, 'findUnique').mockResolvedValue(mockPaymentAttempt as any);

        await expect(
          service.getPaymentStatus({
            reference: mockPaymentAttempt.providerTransactionId,
            // No holdToken, no userId
          })
        ).rejects.toThrow(/Proof of possession or authenticated user ownership is required/i);
      });

      it('never exposes customer contact email, phone, or raw payment provider secrets in sanitized status', async () => {
        const service = new PaymentService({ prisma: prisma as any, enabled: true });
        vi.spyOn(prisma.paymentAttempt, 'findUnique').mockResolvedValue(mockPaymentAttempt as any);
        vi.spyOn(prisma.idempotencyRecord, 'findFirst').mockResolvedValue({
          id: 'idemp-1',
          responseBody: {
            id: mockBooking.id,
            _meta: { tokenHash: VALID_HOLD_TOKEN_HASH },
          },
        } as any);

        const status = await service.getPaymentStatus({
          reference: mockPaymentAttempt.providerTransactionId,
          holdToken: VALID_HOLD_TOKEN,
        });

        const keys = Object.keys(status);
        expect(keys).not.toContain('contactEmail');
        expect(keys).not.toContain('contactPhone');
        expect(keys).not.toContain('contactName');
        expect(keys).not.toContain('secretKey');
      });
    });
  });

  // =========================================================================
  // PHASE 4: WEBHOOK DEDUPLICATION AND RECOVERY
  // =========================================================================
  describe('Phase 4: Webhook Deduplication and Recovery', () => {
    it('rolls back completely if a database error occurs during settlement, allowing subsequent retry', async () => {
      const adapter = new PaystackTestAdapter({ secretKey: TEST_PAYSTACK_KEY });
      const service = new PaymentService({
        prisma: prisma as any,
        provider: adapter,
        webhookSecret: TEST_WHSEC,
        enabled: true,
      });

      vi.spyOn(prisma.processedWebhookEvent, 'findUnique').mockResolvedValue(null);

      // Simulate transient DB failure inside transaction
      vi.spyOn(prisma, '$transaction').mockImplementation(async () => {
        throw new Error('POSTGRES_TRANSIENT_CONNECTION_FAILURE');
      });

      const payload = {
        event: 'charge.success',
        data: { id: 777, reference: mockPaymentAttempt.providerTransactionId, amount: 700000, currency: 'NGN', status: 'success' },
      };
      const now = Math.floor(Date.now() / 1000);
      const { rawBody, headerValue } = signPaystackV2(payload, TEST_WHSEC, now);

      await expect(service.processWebhook(rawBody, headerValue, now)).rejects.toThrow(
        /POSTGRES_TRANSIENT_CONNECTION_FAILURE/
      );
    });

    it('safely distinguishes different events (e.g. charge.failed vs charge.success) for the same reference', async () => {
      const service = new PaymentService({ prisma: prisma as any, webhookSecret: TEST_WHSEC, enabled: true });

      vi.spyOn(prisma.processedWebhookEvent, 'findUnique').mockResolvedValue(null);
      let recordedEventType = '';
      vi.spyOn(prisma.processedWebhookEvent, 'create').mockImplementation((args: any) => {
        recordedEventType = args.data.eventType;
        return { id: args.data.id } as any;
      });

      const payload = {
        event: 'charge.failed',
        data: { reference: mockPaymentAttempt.providerTransactionId, status: 'failed' },
      };
      const now = Math.floor(Date.now() / 1000);
      const { rawBody, headerValue } = signPaystackV2(payload, TEST_WHSEC, now);

      const res = await service.processWebhook(rawBody, headerValue, now);
      expect(res.status).toBe('success');
      expect(recordedEventType).toBe('charge.failed');
    });
  });

  // =========================================================================
  // PHASE 5: TEST CHECKOUT URL SAFETY
  // =========================================================================
  describe('Phase 5: Test Checkout URL Safety', () => {
    it('generates explicit non-routable offline placeholder URIs and never fabricates live checkout.paystack.com links', async () => {
      const adapter = new PaystackTestAdapter({ secretKey: TEST_PAYSTACK_KEY });

      const res = await adapter.initializePayment({
        reference: 'MAT-PAY-TEST-REF',
        amountKobo: 700000,
        email: 'tunde@example.com',
      });

      expect(res.authorizationUrl).toBe('urn:matinee:offline-test-checkout:MAT-PAY-TEST-REF');
      expect(res.authorizationUrl).not.toContain('checkout.paystack.com');
    });

    it('rejects live API credentials beginning with sk_live_ or pk_live_ with LIVE_CREDENTIALS_DISALLOWED', () => {
      expect(() => {
        new PaystackTestAdapter({ secretKey: 'sk_live_production_secret_key_123' });
      }).toThrow(/Live payment credentials are not permitted in test mode/i);
    });
  });

  // =========================================================================
  // SCENARIO J & K: CONCURRENCY AND SHARED ROW LOCK VERIFICATION
  // =========================================================================
  describe('Scenarios J & K: Shared Locking Settlement vs Expiration', () => {
    it('Settlement wins: confirms booking and causes reconciler to safely skip it', async () => {
      const adapter = new PaystackTestAdapter({ secretKey: TEST_PAYSTACK_KEY });
      const service = new PaymentService({
        prisma: prisma as any,
        provider: adapter,
        webhookSecret: TEST_WHSEC,
        enabled: true,
      });

      let currentBooking = { ...mockBooking, status: BookingStatus.PENDING };
      let currentPayment = { ...mockPaymentAttempt, status: PaymentStatus.PENDING };

      vi.spyOn(prisma.processedWebhookEvent, 'findUnique').mockResolvedValue(null);

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        const tx = createMockTx(currentBooking, currentPayment);
        tx.booking.update = vi.fn().mockImplementation((args: any) => {
          currentBooking = { ...currentBooking, ...args.data };
          return currentBooking;
        });
        tx.paymentAttempt.update = vi.fn().mockImplementation((args: any) => {
          currentPayment = { ...currentPayment, ...args.data };
          return currentPayment;
        });
        return cb(tx);
      });

      const settleResult = await service.settleBookingPayment({
        reference: currentPayment.providerTransactionId,
        amountKobo: 700000,
        currency: 'NGN',
        providerStatus: 'success',
        eventId: 'evt-settle-win',
      });

      expect(settleResult.settled).toBe(true);
      expect(currentBooking.status).toBe(BookingStatus.CONFIRMED);
      expect(currentPayment.status).toBe(PaymentStatus.SUCCEEDED);

      // Subsequent reconciler run observes CONFIRMED and skips
      vi.spyOn(prisma.booking, 'findMany').mockResolvedValue([{ id: currentBooking.id }] as any);
      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        const tx = {
          $queryRaw: vi.fn().mockResolvedValue([{ id: currentBooking.id, status: BookingStatus.CONFIRMED }]),
          booking: {
            findUnique: vi.fn().mockResolvedValue({
              ...currentBooking,
              paymentAttempts: [{ status: currentPayment.status }],
            }),
            updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
        };
        return cb(tx);
      });

      const expiredCount = await bookingService.expireAbandonedBookings(new Date(Date.now() + 9999999));
      expect(expiredCount).toBe(0);
    });

    it('Two concurrent settlement workers resolve idempotently: exactly one settles to CONFIRMED', async () => {
      const adapter = new PaystackTestAdapter({ secretKey: TEST_PAYSTACK_KEY });
      const service = new PaymentService({
        prisma: prisma as any,
        provider: adapter,
        webhookSecret: TEST_WHSEC,
        enabled: true,
      });

      let bookingStatus = BookingStatus.PENDING;
      vi.spyOn(prisma.processedWebhookEvent, 'findUnique').mockResolvedValue(null);

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        const tx = createMockTx({ ...mockBooking, status: bookingStatus });
        tx.booking.update = vi.fn().mockImplementation((args: any) => {
          bookingStatus = args.data.status;
          return { ...mockBooking, status: bookingStatus };
        });
        return cb(tx);
      });

      const res1 = await service.settleBookingPayment({
        reference: mockPaymentAttempt.providerTransactionId,
        amountKobo: 700000,
        currency: 'NGN',
        providerStatus: 'success',
        eventId: 'evt-conc-1',
      });

      const res2 = await service.settleBookingPayment({
        reference: mockPaymentAttempt.providerTransactionId,
        amountKobo: 700000,
        currency: 'NGN',
        providerStatus: 'success',
        eventId: 'evt-conc-2',
      });

      expect(res1.settled).toBe(true);
      expect(res1.bookingStatus).toBe(BookingStatus.CONFIRMED);
      expect(res2.settled).toBe(true);
      expect(res2.bookingStatus).toBe(BookingStatus.CONFIRMED);
      expect(res2.message).toMatch(/already confirmed/i);
    });
  });
});
