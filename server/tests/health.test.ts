import { describe, it, expect } from 'vitest';
import { app } from '../src/app.js';
import { testRequest } from './helpers/testRequest.js';

describe('Health & Service Probe API', () => {
  it('GET /api/v1/health returns HTTP 200 with structured health details', async () => {
    const res = await testRequest(app, {
      method: 'GET',
      url: '/api/v1/health',
    });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'healthy');
    expect(res.body).toHaveProperty('service', 'matinee-backend-api');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('uptimeSeconds');
    expect(typeof res.body.uptimeSeconds).toBe('number');
    expect(res.body).toHaveProperty('version', '1.0.0');

    // Invariant: Do not claim database, redis, or payments are healthy without verification
    expect(res.body).toHaveProperty('subsystems');
    expect(res.body.subsystems.api).toBe('operational');
    expect(res.body.subsystems.database).toContain('unconnected');
    expect(res.body.subsystems.redis).toContain('unconnected');
    expect(res.body.subsystems.payments).toContain('disabled');
  });

  it('GET / returns HTTP 200 service descriptor', async () => {
    const res = await testRequest(app, {
      method: 'GET',
      url: '/',
    });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('name', 'Matinee Backend API');
    expect(res.body).toHaveProperty('status', 'online');
  });
});
