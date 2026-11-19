import { Router } from 'express';
import { createBooking } from '../controllers/bookingController.js';
import { validateRequest } from '../middleware/validate.js';
import { createBookingBodySchema } from '../schemas/bookingSchemas.js';

const router = Router();

// POST /api/v1/bookings — Atomically initialize transactional pending booking order
router.post(
  '/',
  validateRequest({ body: createBookingBodySchema }),
  createBooking
);

export default router;
