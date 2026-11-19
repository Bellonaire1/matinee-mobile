import { describe, it, expect } from 'vitest';
import express, { Express } from 'express';
import { z } from 'zod';
import { errorHandler, AppError } from '../src/middleware/errorHandler.js';
import { validateRequest } from '../src/middleware/validate.js';
import { app } from '../src/app.js';
import { testRequest } from './helpers/testRequest.js';

describe('Error & Middleware Handling', () => {
  it('returns 404 with structured JSON on unknown route', async () => {
    const res = await testRequest(app, {
      method: 'GET',
      url: '/api/v1/unknown-endpoint-xyz',
    });

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('status', 'error');
    expect(res.body).toHaveProperty('code', 'ROUTE_NOT_FOUND');
    expect(res.body.message).toContain('Cannot GET /api/v1/unknown-endpoint-xyz');
  });

  it('handles AppError with custom status code and error code', async () => {
    const testApp: Express = express();
    testApp.get('/test-error', () => {
      throw new AppError('Resource is forbidden', 403, 'FORBIDDEN_ACTION', { reason: 'insufficient_permissions' });
    });
    testApp.use(errorHandler);

    const res = await testRequest(testApp, {
      method: 'GET',
      url: '/test-error',
    });

    expect(res.status).toBe(403);
    expect(res.body.status).toBe('error');
    expect(res.body.code).toBe('FORBIDDEN_ACTION');
    expect(res.body.message).toBe('Resource is forbidden');
    expect(res.body.details).toEqual({ reason: 'insufficient_permissions' });
  });

  it('validates request payload schema using Zod middleware', async () => {
    const testApp: Express = express();
    testApp.use(express.json());

    const sampleSchema = z.object({
      seatCount: z.number().int().min(1).max(8),
      contactEmail: z.string().email(),
    });

    testApp.post(
      '/test-validation',
      validateRequest({ body: sampleSchema }),
      (req, res) => {
        res.status(200).json({ success: true, data: req.body });
      }
    );
    testApp.use(errorHandler);

    // 1. Invalid payload (exceeding 8 seats, invalid email)
    const badRes = await testRequest(testApp, {
      method: 'POST',
      url: '/test-validation',
      body: {
        seatCount: 12,
        contactEmail: 'not-an-email',
      },
    });

    expect(badRes.status).toBe(400);
    expect(badRes.body.status).toBe('error');
    expect(badRes.body.code).toBe('VALIDATION_ERROR');
    expect(badRes.body.errors.length).toBe(2);

    // 2. Valid payload
    const goodRes = await testRequest(testApp, {
      method: 'POST',
      url: '/test-validation',
      body: {
        seatCount: 4,
        contactEmail: 'alex@example.com',
      },
    });

    expect(goodRes.status).toBe(200);
    expect(goodRes.body.success).toBe(true);
    expect(goodRes.body.data.seatCount).toBe(4);
  });
});
