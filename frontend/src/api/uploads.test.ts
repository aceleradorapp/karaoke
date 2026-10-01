import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeXhr, installFakeXhr, lastRequest } from '../test/fakeXhr';
import { ApiError } from './client';
import { uploadAudioFile } from './uploads';

const song = new File(['audio'], 'Artista - Música.mp3', { type: 'audio/mpeg' });

describe('uploadAudioFile', () => {
  beforeEach(installFakeXhr);

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the file to the uploads endpoint', () => {
    void uploadAudioFile(song);

    expect(lastRequest()).toMatchObject({ method: 'POST', url: '/api/uploads' });
    expect(lastRequest().formKeys()).toEqual(['files']);
    expect((lastRequest().body?.get('files') as File).name).toBe('Artista - Música.mp3');
  });

  it('sends who is uploading before the file, so the server knows it first', () => {
    void uploadAudioFile(song, { profileId: 'p1' });

    expect(lastRequest().formKeys()).toEqual(['profileId', 'files']);
    expect(lastRequest().body?.get('profileId')).toBe('p1');
  });

  it('reports progress as a fraction and finishes at 100%', async () => {
    const onProgress = vi.fn();
    const upload = uploadAudioFile(song, { onProgress });

    lastRequest().reportProgress(250, 1000);
    lastRequest().respond(201, { received: [{ filename: song.name }], rejected: [] });
    await upload;

    expect(onProgress.mock.calls.map(([fraction]) => fraction)).toEqual([0.25, 1]);
  });

  it('ignores progress events without a known total', () => {
    const onProgress = vi.fn();
    void uploadAudioFile(song, { onProgress });

    lastRequest().upload.onprogress?.({ lengthComputable: false, loaded: 10, total: 0 });

    expect(onProgress).not.toHaveBeenCalled();
  });

  it('rejects with the message and code sent by the server', async () => {
    const upload = uploadAudioFile(song);

    lastRequest().respond(400, { error: { code: 'UNSUPPORTED_FILE', message: 'Formato não suportado' } });

    const error = await upload.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'UNSUPPORTED_FILE', message: 'Formato não suportado', status: 400 });
  });

  it('rejects with a generic message when the server sends something unreadable', async () => {
    const upload = uploadAudioFile(song);
    const request = lastRequest();
    request.status = 500;
    request.responseText = '<html>oops</html>';
    request.onload?.();

    await expect(upload).rejects.toMatchObject({ message: 'Não foi possível enviar o arquivo', status: 500 });
  });

  it('rejects with a connection message when the network fails', async () => {
    const upload = uploadAudioFile(song);

    lastRequest().failNetwork();

    await expect(upload).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      message: 'Falha de conexão durante o envio',
    });
  });

  it('aborts the request when the signal fires', async () => {
    const controller = new AbortController();
    const upload = uploadAudioFile(song, { signal: controller.signal });

    controller.abort();

    await expect(upload).rejects.toMatchObject({ name: 'AbortError' });
    expect((lastRequest() as FakeXhr).aborted).toBe(true);
  });
});
