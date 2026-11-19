import { Router } from 'express';
import { getHealthStatus } from '../controllers/healthController.js';

const router = Router();

/**
 * GET /api/v1/health
 * Public health-check endpoint.
 * Requires no authentication.
 */
router.get('/health', getHealthStatus);

export default router;

