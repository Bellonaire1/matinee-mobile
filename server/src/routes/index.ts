import { Router } from 'express';
import healthRouter from './health.js';
import moviesRouter from './movies.js';
import cinemasRouter from './cinemas.js';

const apiRouter = Router();

// Public health probe
apiRouter.use(healthRouter);

// Discovery endpoints
apiRouter.use('/movies', moviesRouter);
apiRouter.use('/cinemas', cinemasRouter);

export default apiRouter;

