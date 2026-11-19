import { Router } from 'express';
import {
  createHold,
  getHold,
  releaseHold,
  heartbeatHold,
} from '../controllers/holdController.js';
import { validateRequest } from '../middleware/validate.js';
import { createHoldBodySchema } from '../schemas/holdSchemas.js';

const router = Router();

// POST /api/v1/holds — Acquire atomic temporary seat hold
router.post(
  '/',
  validateRequest({ body: createHoldBodySchema }),
  createHold
);

// GET /api/v1/holds — Inspect current hold details and remaining TTL (requires X-Hold-Token or Bearer header)
router.get(
  '/',
  getHold
);

// DELETE /api/v1/holds — Safely release current hold (requires X-Hold-Token or Bearer header)
router.delete(
  '/',
  releaseHold
);

// POST /api/v1/holds/heartbeat — Extend current hold window (requires X-Hold-Token or Bearer header)
router.post(
  '/heartbeat',
  heartbeatHold
);

export default router;
