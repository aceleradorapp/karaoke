import fs from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  competitionImageFromSongSchema,
  competitionParticipantsSchema,
  competitionSongSchema,
  createCompetitionSchema,
  updateCompetitionSchema,
} from '@caraoke/shared';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { AppError, notFound } from '../../utils/errors.js';
import {
  IMAGE_MIME_BY_EXT,
  MAX_IMAGE_BYTES,
  addCompetitionSong,
  createCompetition,
  deleteCompetition,
  finishCompetition,
  getCompetition,
  imageExtFor,
  imagePathOf,
  listCompetitions,
  removeCompetitionSong,
  removeImage,
  saveUploadedImage,
  setParticipants,
  startCompetition,
  updateCompetition,
  useSongCoverAsImage,
} from './service.js';

const CREATED = 201;
const NO_CONTENT = 204;
const BAD_REQUEST = 400;

const idParamsSchema = z.object({ id: z.string().min(1) });
const songEntryParamsSchema = z.object({ id: z.string().min(1), entryId: z.string().min(1) });

export async function competitionRoutes(app: FastifyInstance): Promise<void> {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get('/competitions', async () => ({ items: await listCompetitions() }));

  typedApp.post('/competitions', { schema: { body: createCompetitionSchema } }, async (request, reply) =>
    reply.status(CREATED).send(await createCompetition(request.body)),
  );

  typedApp.get('/competitions/:id', { schema: { params: idParamsSchema } }, async (request) =>
    getCompetition(request.params.id),
  );

  typedApp.patch(
    '/competitions/:id',
    { schema: { params: idParamsSchema, body: updateCompetitionSchema } },
    async (request) => updateCompetition(request.params.id, request.body),
  );

  typedApp.delete('/competitions/:id', { schema: { params: idParamsSchema } }, async (request, reply) => {
    await deleteCompetition(request.params.id);
    return reply.status(NO_CONTENT).send();
  });

  typedApp.put(
    '/competitions/:id/participants',
    { schema: { params: idParamsSchema, body: competitionParticipantsSchema } },
    async (request) => setParticipants(request.params.id, request.body.profileIds),
  );

  typedApp.post(
    '/competitions/:id/songs',
    { schema: { params: idParamsSchema, body: competitionSongSchema } },
    async (request) => addCompetitionSong(request.params.id, request.body.profileId, request.body.songId),
  );

  typedApp.delete(
    '/competitions/:id/songs/:entryId',
    { schema: { params: songEntryParamsSchema } },
    async (request) => removeCompetitionSong(request.params.id, request.params.entryId),
  );

  typedApp.post('/competitions/:id/start', { schema: { params: idParamsSchema } }, async (request) =>
    startCompetition(request.params.id),
  );

  typedApp.post('/competitions/:id/finish', { schema: { params: idParamsSchema } }, async (request) =>
    finishCompetition(request.params.id),
  );

  typedApp.post('/competitions/:id/image', { schema: { params: idParamsSchema } }, async (request) => {
    const file = await request.file();
    if (!file) throw new AppError('IMAGE_REQUIRED', 'Escolha uma imagem', BAD_REQUEST);
    const ext = imageExtFor(file.mimetype);
    if (!ext) throw new AppError('UNSUPPORTED_IMAGE', 'Use uma imagem JPG, PNG ou WEBP', BAD_REQUEST);
    const data = await file.toBuffer();
    if (data.length > MAX_IMAGE_BYTES) {
      throw new AppError('IMAGE_TOO_LARGE', 'A imagem pode ter até 5 MB', BAD_REQUEST);
    }
    return saveUploadedImage(request.params.id, ext, data);
  });

  typedApp.post(
    '/competitions/:id/image/from-song',
    { schema: { params: idParamsSchema, body: competitionImageFromSongSchema } },
    async (request) => useSongCoverAsImage(request.params.id, request.body.songId),
  );

  typedApp.delete('/competitions/:id/image', { schema: { params: idParamsSchema } }, async (request) =>
    removeImage(request.params.id),
  );

  typedApp.get('/competitions/:id/image', { schema: { params: idParamsSchema } }, async (request, reply) => {
    const competition = await prisma.competition.findUnique({
      where: { id: request.params.id },
      select: { id: true, imageExt: true },
    });
    const imagePath = competition ? imagePathOf(competition) : null;
    if (!competition?.imageExt || !imagePath)
      throw notFound('IMAGE_NOT_FOUND', 'Esta disputa não tem imagem');
    const data = await fs.readFile(imagePath).catch(() => null);
    if (!data) throw notFound('IMAGE_NOT_FOUND', 'Esta disputa não tem imagem');
    return reply.type(IMAGE_MIME_BY_EXT[competition.imageExt] ?? 'application/octet-stream').send(data);
  });
}
