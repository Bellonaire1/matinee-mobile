import { Router } from 'express';
import { getMovies, getMovieById } from '../controllers/movieController.js';
import { validateRequest } from '../middleware/validate.js';
import { listMoviesQuerySchema, getMovieParamsSchema } from '../schemas/movieSchemas.js';

const router = Router();

router.get(
  '/',
  validateRequest({ query: listMoviesQuerySchema }),
  getMovies
);

router.get(
  '/:id',
  validateRequest({ params: getMovieParamsSchema }),
  getMovieById
);

export default router;
