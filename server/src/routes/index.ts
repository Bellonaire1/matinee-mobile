import { Router } from 'express';
import healthRouter from './health.js';

const apiRouter = Router();

// Public health probe
apiRouter.use(healthRouter);

export default apiRouter;

