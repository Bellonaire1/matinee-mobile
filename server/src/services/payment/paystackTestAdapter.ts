import { PaymentProvider } from '@prisma/client';
import {
  IPaymentProvider,
  InitializeProviderPaymentParams,
  InitializeProviderPaymentResult,
} from './paymentProviderInterface.js';
import { VerifyPaymentResult } from './paymentTypes.js';
import { AppError } from '../../middleware/errorHandler.js';

export interface PaystackAdapterConfig {
  secretKey: string;
  publicKey?: string;
  baseUrl?: string;
}

/**
 * Paystack TEST-MODE Payment Adapter.
 *
 * Security & Lifecycle Invariants:
 * 1. Strictly operates in test mode. Rejects any live credential ('sk_live_...') with an immediate error.
 * 2. Does NOT perform external HTTP requests during offline test operations.
 * 3. Uses dependency-injected verification stubs to return deterministic provider outcomes.
 * 4. Derives checkout references and authorization payloads safely without leaking secrets.
 */
export class PaystackTestAdapter implements IPaymentProvider {
  readonly providerName: PaymentProvider = PaymentProvider.PAYSTACK_TEST;
  private secretKey: string;
  private publicKey?: string;
  private baseUrl: string;

  // Test-only mock stub map for deterministic verification behavior
  private verificationStubs: Map<string, Partial<VerifyPaymentResult>> = new Map();

  constructor(config: PaystackAdapterConfig) {
    if (!config.secretKey || !config.secretKey.trim()) {
      throw new AppError(
        'Paystack test secret key is required for payment adapter initialization',
        500,
        'PAYMENT_CONFIG_MISSING'
      );
    }

    const cleanKey = config.secretKey.trim();

    // STRICT SAFETY GATE: Never permit live-mode credentials in test mode
    if (cleanKey.startsWith('sk_live_') || cleanKey.startsWith('pk_live_')) {
      throw new AppError(
        'Live payment credentials are not permitted in test mode',
        500,
        'LIVE_CREDENTIALS_DISALLOWED'
      );
    }

    this.secretKey = cleanKey;
    this.publicKey = config.publicKey?.trim();
    this.baseUrl = config.baseUrl || 'https://api.paystack.co';
  }

  /**
   * Simulates Paystack transaction initialization without network calls.
   */
  async initializePayment(
    params: InitializeProviderPaymentParams
  ): Promise<InitializeProviderPaymentResult> {
    const { reference, amountKobo, email } = params;

    if (!reference || !reference.trim()) {
      throw new AppError('Payment reference is required', 400, 'INVALID_PAYMENT_REFERENCE');
    }

    if (!amountKobo || amountKobo <= 0) {
      throw new AppError('Payment amount must be greater than zero', 400, 'INVALID_PAYMENT_AMOUNT');
    }

    if (!email || !email.includes('@')) {
      throw new AppError('Valid customer email is required', 400, 'INVALID_PAYMENT_EMAIL');
    }

    const accessCode = `test_ac_${reference}`;
    // OFFLINE TEST FIXTURE PLACEHOLDER:
    // Explicitly non-routable offline test fixture placeholder URI.
    // Clarifies that no live or simulated Paystack-hosted payment page is available
    // during offline testing without explicit API authorization.
    const authorizationUrl = `urn:matinee:offline-test-checkout:${reference}`;

    return {
      authorizationUrl,
      accessCode,
      reference,
    };
  }

  /**
   * Simulates Paystack transaction verification without network calls.
   * Checks the stub map for pre-configured test scenarios; defaults to verified success.
   */
  async verifyPayment(reference: string): Promise<VerifyPaymentResult> {
    if (!reference || !reference.trim()) {
      throw new AppError('Payment reference is required for verification', 400, 'INVALID_PAYMENT_REFERENCE');
    }

    const cleanRef = reference.trim();
    const stub = this.verificationStubs.get(cleanRef);

    if (stub) {
      if (stub.status === 'failed') {
        return {
          success: false,
          reference: cleanRef,
          amountKobo: stub.amountKobo ?? 0,
          currency: stub.currency ?? 'NGN',
          status: 'failed',
          gatewayResponse: stub.gatewayResponse ?? 'The transaction was declined by the bank',
          channel: stub.channel ?? 'card',
        };
      }

      if (stub.status === 'abandoned') {
        return {
          success: false,
          reference: cleanRef,
          amountKobo: stub.amountKobo ?? 0,
          currency: stub.currency ?? 'NGN',
          status: 'abandoned',
          gatewayResponse: 'Transaction abandoned by customer',
          channel: stub.channel ?? 'card',
        };
      }

      return {
        success: stub.success ?? true,
        reference: cleanRef,
        amountKobo: stub.amountKobo ?? 700000,
        currency: stub.currency ?? 'NGN',
        status: (stub.status as 'success') ?? 'success',
        gatewayResponse: stub.gatewayResponse ?? 'Successful',
        channel: stub.channel ?? 'card',
        paidAt: stub.paidAt ?? new Date(),
        metadata: stub.metadata,
      };
    }

    // Default simulated provider response: Successful payment in NGN
    return {
      success: true,
      reference: cleanRef,
      amountKobo: 700000,
      currency: 'NGN',
      status: 'success',
      gatewayResponse: 'Successful',
      channel: 'card',
      paidAt: new Date(),
    };
  }

  /**
   * Helper for tests to register a deterministic provider verification outcome.
   */
  setVerificationStub(reference: string, stub: Partial<VerifyPaymentResult>): void {
    this.verificationStubs.set(reference, stub);
  }

  clearVerificationStubs(): void {
    this.verificationStubs.clear();
  }
}
