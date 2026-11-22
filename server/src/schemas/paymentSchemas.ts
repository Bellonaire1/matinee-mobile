import { z } from 'zod';

export const initializePaymentBodySchema = z.object({
  bookingId: z.string().trim().uuid('Booking ID must be a valid UUID'),
  email: z.string().trim().email('Valid customer email is required').optional(),
});

export type InitializePaymentBody = z.infer<typeof initializePaymentBodySchema>;

export const verifyPaymentParamsSchema = z.object({
  reference: z.string().trim().min(1, 'Payment reference is required'),
});

export type VerifyPaymentParams = z.infer<typeof verifyPaymentParamsSchema>;
