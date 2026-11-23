import { Router } from 'express';
import { getHealthStatus, getReadinessStatus } from '../controllers/healthController.js';

const router = Router();

/**
 * GET /api/v1/health
 * Public liveness-check endpoint.
 * Requires no authentication.
 */
router.get('/health', getHealthStatus);

/**
 * GET /api/v1/ready
 * Public readiness-check endpoint.
 * Verifies live PostgreSQL and Redis dependency health.
 * Requires no authentication.
 */
router.get('/ready', getReadinessStatus);

export default router;

