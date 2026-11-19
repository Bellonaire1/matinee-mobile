import { Router } from 'express';
import { getCinemas, getCinemaShowtimes } from '../controllers/cinemaController.js';
import { validateRequest } from '../middleware/validate.js';
import {
  listCinemasQuerySchema,
  getCinemaParamsSchema,
  getCinemaShowtimesQuerySchema,
} from '../schemas/cinemaSchemas.js';

const router = Router();

router.get(
  '/',
  validateRequest({ query: listCinemasQuerySchema }),
  getCinemas
);

router.get(
  '/:id/showtimes',
  validateRequest({
    params: getCinemaParamsSchema,
    query: getCinemaShowtimesQuerySchema,
  }),
  getCinemaShowtimes
);

export default router;
