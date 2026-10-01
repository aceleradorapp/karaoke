import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { resetDatabase } from '../test/database.js';
import { buildApp } from './app.js';
import { prisma } from './db.js';

describe('app', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await resetDatabase();
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const postJson = (url: string, payload?: string) =>
    app.inject({ method: 'POST', url, headers: { 'content-type': 'application/json' }, payload });

  it('answers the health check', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, version: expect.any(String) });
  });

  it('answers unknown routes with the standard error format', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/does-not-exist' });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('ROUTE_NOT_FOUND');
  });

  describe('JSON bodies', () => {
    it('accepts an empty body even when the content type says JSON', async () => {
      const response = await postJson('/api/jobs/unknown/cancel', '');
      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('JOB_NOT_FOUND');
    });

    it('accepts a missing body with the JSON content type', async () => {
      const response = await postJson('/api/jobs/unknown/cancel');
      expect(response.statusCode).toBe(404);
    });

    it('still validates routes that require a body', async () => {
      const response = await postJson('/api/profiles', '');
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('answers 400 for malformed JSON instead of a server error', async () => {
      const response = await postJson('/api/profiles', '{ not json');
      expect(response.statusCode).toBe(400);
      expect(response.json().error.message).toBe('Requisição inválida');
    });

    it('refuses prototype poisoning attempts', async () => {
      const response = await postJson(
        '/api/profiles',
        '{"__proto__": {"admin": true}, "name": "A", "avatar": "lion"}',
      );
      expect(response.statusCode).toBe(400);
    });

    it('still reads normal JSON bodies', async () => {
      const response = await postJson('/api/profiles', JSON.stringify({ name: 'Ana', avatar: 'lion' }));
      expect(response.statusCode).toBe(201);
    });
  });
});
