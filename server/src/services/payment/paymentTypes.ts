import { PaymentProvider, PaymentStatus, BookingStatus, TicketStatus } from '@prisma/client';

export interface InitializePaymentInput {
  bookingId: string;
  userId?: string | null;
  holdToken?: string;
  contactEmail?: string;
  idempotencyKey?: string;
}

export interface InitializePaymentResult {
  paymentAttemptId: string;
  providerTransactionId: string;
  authorizationUrl: string;
  accessCode: string;
  reference: string;
  amountKobo: number;
  currency: string;
  status: PaymentStatus;
  bookingReference: string;
}

export interface VerifyPaymentResult {
  success: boolean;
  reference: string;
  amountKobo: number;
  currency: string;
  status: 'success' | 'failed' | 'abandoned';
  gatewayResponse?: string;
  channel?: string;
  paidAt?: Date;
  metadata?: Record<string, any>;
}

export interface PaystackWebhookData {
  id?: number | string;
  domain?: string;
  status: string;
  reference: string;
  amount: number;
  message?: string | null;
  gateway_response?: string;
  paid_at?: string;
  created_at?: string;
  channel?: string;
  currency: string;
  ip_address?: string;
  metadata?: Record<string, any>;
  fees?: number;
  customer?: {
    id?: number;
    email?: string;
    customer_code?: string;
  };
}

export interface PaystackWebhookPayload {
  event: string;
  data: PaystackWebhookData;
}

export interface SettlePaymentParams {
  eventId: string;
  reference: string;
  amountKobo: number;
  currency: string;
  providerStatus: string;
  gatewayResponse?: string;
  channel?: string;
  rawData?: Record<string, any>;
}

export interface SettlePaymentResult {
  settled: boolean;
  bookingId: string;
  bookingReference: string;
  bookingStatus: BookingStatus;
  paymentAttemptId: string;
  paymentStatus: PaymentStatus;
  requiresRefund: boolean;
  message: string;
}
