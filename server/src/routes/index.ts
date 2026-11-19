import { Router } from 'express';
import healthRouter from './health.js';
import moviesRouter from './movies.js';
import cinemasRouter from './cinemas.js';
import showtimesRouter from './showtimes.js';
import holdsRouter from './holds.js';

const apiRouter = Router();

// Public health probe
apiRouter.use(healthRouter);

// Discovery endpoints
apiRouter.use('/movies', moviesRouter);
apiRouter.use('/cinemas', cinemasRouter);
apiRouter.use('/showtimes', showtimesRouter);

// Seat reservation & hold endpoints
apiRouter.use('/holds', holdsRouter);

export default apiRouter;

