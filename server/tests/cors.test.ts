import { describe, it, expect } from 'vitest';
import { app, isOriginAllowed } from '../src/app.js';
import { testRequest } from './helpers/testRequest.js';

describe('CORS Policy & Origin Security', () => {
  describe('isOriginAllowed Helper Function', () => {
    const config = 'http://localhost:3000,http://localhost:8081,https://matinee.app';

    it('permits requests with no Origin header (native mobile apps, curl, backend)', () => {
      expect(isOriginAllowed(undefined, config)).toBe(true);
      expect(isOriginAllowed('', config)).toBe(true);
    });

    it('permits explicitly whitelisted browser origins', () => {
      expect(isOriginAllowed('http://localhost:3000', config)).toBe(true);
      expect(isOriginAllowed('http://localhost:8081', config)).toBe(true);
      expect(isOriginAllowed('https://matinee.app', config)).toBe(true);
    });

    it('matches origins case-insensitively', () => {
      expect(isOriginAllowed('HTTP://LOCALHOST:3000', config)).toBe(true);
      expect(isOriginAllowed('HTTPS://MATINEE.APP', config)).toBe(true);
    });

    it('rejects unauthorized or arbitrary browser origins', () => {
      expect(isOriginAllowed('http://evil.com', config)).toBe(false);
      expect(isOriginAllowed('https://malicious-site.org', config)).toBe(false);
      expect(isOriginAllowed('http://localhost:4000', config)).toBe(false);
    });

    it('refuses wildcard reflection when credentials are used', () => {
      // In production/credentials mode, wildcard "*" config does not reflect arbitrary origins
      expect(isOriginAllowed('http://evil.com', '*')).toBe(false);
    });
  });

  describe('CORS HTTP Middleware Integration', () => {
    it('sets Allow-Origin and Allow-Credentials headers for whitelisted origin', async () => {
      const res = await testRequest(app, {
        method: 'GET',
        url: '/api/v1/health',
        headers: {
          origin: 'http://localhost:3000',
        },
      });

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('omits Access-Control-Allow-Origin header for disallowed browser origin', async () => {
      const res = await testRequest(app, {
        method: 'GET',
        url: '/api/v1/health',
        headers: {
          origin: 'http://attacker-site.com',
        },
      });

      // Status should succeed but without CORS header so browser blocks JavaScript access
      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('allows native mobile app requests without Origin header', async () => {
      const res = await testRequest(app, {
        method: 'GET',
        url: '/api/v1/health',
      });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});
