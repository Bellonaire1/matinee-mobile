import { PaymentProvider } from '@prisma/client';
import { VerifyPaymentResult } from './paymentTypes.js';

export interface InitializeProviderPaymentParams {
  reference: string;
  amountKobo: number;
  email: string;
  callbackUrl?: string;
  metadata?: Record<string, any>;
}

export interface InitializeProviderPaymentResult {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
}

export interface IPaymentProvider {
  readonly providerName: PaymentProvider;

  initializePayment(
    params: InitializeProviderPaymentParams
  ): Promise<InitializeProviderPaymentResult>;

  verifyPayment(reference: string): Promise<VerifyPaymentResult>;
}
