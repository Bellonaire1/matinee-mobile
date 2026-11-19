import { Router } from 'express';
import { getShowtimeSeats } from '../controllers/showtimeController.js';
import { createHold } from '../controllers/holdController.js';
import { validateRequest } from '../middleware/validate.js';
import { getShowtimeSeatsParamsSchema } from '../schemas/showtimeSchemas.js';
import { createHoldBodySchema, showtimeHoldParamsSchema } from '../schemas/holdSchemas.js';

const router = Router();

router.get(
  '/:id/seats',
  validateRequest({ params: getShowtimeSeatsParamsSchema }),
  getShowtimeSeats
);

router.post(
  '/:id/holds',
  validateRequest({
    params: showtimeHoldParamsSchema,
    body: createHoldBodySchema,
  }),
  createHold
);

export default router;
