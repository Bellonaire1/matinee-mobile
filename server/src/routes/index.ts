import { Router } from 'express';
import healthRouter from './health.js';
import moviesRouter from './movies.js';
import cinemasRouter from './cinemas.js';
import showtimesRouter from './showtimes.js';
import holdsRouter from './holds.js';
import bookingsRouter from './bookings.js';
import paymentsRouter from './payments.js';
import staffAuthRouter from './staffAuth.js';
import ticketsRouter from './tickets.js';

const apiRouter = Router();

// Public health probe
apiRouter.use(healthRouter);

// Discovery endpoints
apiRouter.use('/movies', moviesRouter);
apiRouter.use('/cinemas', cinemasRouter);
apiRouter.use('/showtimes', showtimesRouter);

// Seat reservation & hold endpoints
apiRouter.use('/holds', holdsRouter);

// Transactional booking endpoints
apiRouter.use('/bookings', bookingsRouter);

// Test payment endpoints (Milestone M05.6)
apiRouter.use('/payments', paymentsRouter);

// Staff authentication and admission scanner endpoints.
apiRouter.use('/staff-auth', staffAuthRouter);
apiRouter.use('/tickets', ticketsRouter);

export default apiRouter;
