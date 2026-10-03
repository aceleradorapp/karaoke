import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TEST_WORKER_TOKEN } from '../../test/constants.js';
import { resetDatabase } from '../../test/database.js';
import { buildApp } from '../app.js';
import { prisma } from '../db.js';

const ACCESS_CODE = 'ABC234';

const PHONE_ADDRESS = '192.168.0.50';
const STAGE_ADDRESS = '127.0.0.1';

describe('access control', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  beforeEach(async () => {
    await resetDatabase();
    await prisma.setting.create({ data: { key: 'access.code', value: ACCESS_CODE } });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  function request(url: string, remoteAddress: string, headers: Record<string, string> = {}) {
    return app.inject({ method: 'GET', url, remoteAddress, headers });
  }

  it('lets the stage (loopback) reach any api route without a code', async () => {
    expect((await request('/api/health', STAGE_ADDRESS)).statusCode).toBe(200);
    expect((await request('/api/system/info', STAGE_ADDRESS)).statusCode).toBe(200);
    expect((await request('/api/health', '::1')).statusCode).toBe(200);
  });

  it('rejects a phone without an access code', async () => {
    const response = await request('/api/health', PHONE_ADDRESS);
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('ACCESS_DENIED');
  });

  it('rejects a phone with a wrong access code', async () => {
    const response = await request('/api/health', PHONE_ADDRESS, { 'x-access-code': 'WRONG1' });
    expect(response.statusCode).toBe(401);
  });

  it('lets a phone with the right code reach an allowed route', async () => {
    const response = await request('/api/health', PHONE_ADDRESS, { 'x-access-code': ACCESS_CODE });
    expect(response.statusCode).toBe(200);
  });

  it('blocks a phone with the right code on routes outside the allowed list', async () => {
    const response = await request('/api/system/info', PHONE_ADDRESS, { 'x-access-code': ACCESS_CODE });
    expect(response.statusCode).toBe(401);
  });

  it('blocks a phone from reading media files', async () => {
    const response = await request('/media/some-song/instrumental.mp3', PHONE_ADDRESS, {
      'x-access-code': ACCESS_CODE,
    });
    expect(response.statusCode).toBe(401);
  });

  it('lets a phone with the code see the covers, even with the code in the address (images cannot send headers)', async () => {
    const byQuery = await request(`/media/some-song/capa.jpg?v=1&c=${ACCESS_CODE}`, PHONE_ADDRESS);
    const byHeader = await request('/media/some-song/capa.jpg', PHONE_ADDRESS, {
      'x-access-code': ACCESS_CODE,
    });
    expect(byQuery.statusCode).toBe(404);
    expect(byHeader.statusCode).toBe(404);
  });

  it('refuses a cover with a wrong code or without a code', async () => {
    expect((await request('/media/some-song/capa.jpg?c=ZZZ999', PHONE_ADDRESS)).statusCode).toBe(401);
    expect((await request('/media/some-song/capa.jpg', PHONE_ADDRESS)).statusCode).toBe(401);
  });

  it('never opens the audio to the phone, not even with the code in the address', async () => {
    const response = await request(`/media/some-song/voz.mp3?c=${ACCESS_CODE}`, PHONE_ADDRESS);
    expect(response.statusCode).toBe(401);
  });

  it('lets the phone read the lyrics with the code in the address, to follow along (ADR-009)', async () => {
    const lyrics = await request(`/media/some-song/letra.json?c=${ACCESS_CODE}`, PHONE_ADDRESS);
    expect(lyrics.statusCode).not.toBe(401);
    const withoutCode = await request('/media/some-song/letra.json', PHONE_ADDRESS);
    expect(withoutCode.statusCode).toBe(401);
  });

  it('does not accept the code in the address for the API', async () => {
    expect((await request(`/api/jobs?c=${ACCESS_CODE}`, PHONE_ADDRESS)).statusCode).toBe(401);
  });

  it('does not trust a forwarded address sent by a phone', async () => {
    const response = await request('/api/system/info', PHONE_ADDRESS, { 'x-forwarded-for': '127.0.0.1' });
    expect(response.statusCode).toBe(401);
  });

  it('trusts the forwarded address sent by the local dev proxy', async () => {
    const fromPhone = await request('/api/health', STAGE_ADDRESS, { 'x-forwarded-for': PHONE_ADDRESS });
    expect(fromPhone.statusCode).toBe(401);
    const fromStage = await request('/api/health', STAGE_ADDRESS, { 'x-forwarded-for': '127.0.0.1' });
    expect(fromStage.statusCode).toBe(200);
  });

  it('requires the worker token on internal routes, even from loopback', async () => {
    expect((await request('/api/internal/settings', STAGE_ADDRESS)).statusCode).toBe(401);
    const wrong = await request('/api/internal/settings', STAGE_ADDRESS, { 'x-worker-token': 'nope' });
    expect(wrong.statusCode).toBe(401);
    const right = await request('/api/internal/settings', STAGE_ADDRESS, {
      'x-worker-token': TEST_WORKER_TOKEN,
    });
    expect(right.statusCode).toBe(200);
  });
});
