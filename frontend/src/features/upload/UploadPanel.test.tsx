import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfileDTO } from '@caraoke/shared';
import { useProfileStore } from '../../stores/useProfileStore';
import { FakeXhr, installFakeXhr, lastRequest } from '../../test/fakeXhr';
import { UploadPanel } from './UploadPanel';

const ANA: ProfileDTO = {
  id: 'p1',
  name: 'Ana',
  avatar: 'lion',
  theme: 'cinema',
  isGuest: false,
  createdAt: '2026-10-01T10:00:00.000Z',
  lastUsedAt: '2026-10-01T10:00:00.000Z',
};

const audio = (name: string, size = 100) => new File([new Uint8Array(size)], name, { type: 'audio/mpeg' });

const dropFiles = (files: File[]) =>
  fireEvent.drop(screen.getByTestId('dropzone'), { dataTransfer: { files } });

const SUCCESS = { received: [{ filename: 'x' }], rejected: [] };

const settle = (action: () => void) =>
  act(async () => {
    action();
  });

describe('UploadPanel', () => {
  beforeEach(() => {
    installFakeXhr();
    useProfileStore.setState({ currentProfile: ANA });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uploads a dropped file, identifying who is uploading', () => {
    render(<UploadPanel />);

    dropFiles([audio('Artista - Música.mp3')]);

    expect(FakeXhr.instances).toHaveLength(1);
    expect(lastRequest().formKeys()).toEqual(['profileId', 'files']);
    expect(lastRequest().body?.get('profileId')).toBe('p1');
  });

  it('uploads files chosen with the file picker', () => {
    render(<UploadPanel />);

    const input = screen.getByLabelText('Escolher arquivos de áudio');
    fireEvent.change(input, { target: { files: [audio('A - B.mp3')] } });

    expect(FakeXhr.instances).toHaveLength(1);
    expect(screen.getByText('A - B.mp3')).toBeInTheDocument();
  });

  it('only accepts audio formats in the file picker', () => {
    render(<UploadPanel />);
    expect(screen.getByLabelText('Escolher arquivos de áudio')).toHaveAttribute(
      'accept',
      '.mp3,.m4a,.wav,.flac,.ogg,.webm,.opus,.aac',
    );
  });

  it('shows the progress of the file being uploaded and marks it as sent', async () => {
    render(<UploadPanel />);
    dropFiles([audio('A - B.mp3')]);

    act(() => lastRequest().reportProgress(50, 100));
    expect(screen.getByRole('progressbar', { name: 'Enviando A - B.mp3' })).toHaveAttribute(
      'aria-valuenow',
      '50',
    );

    await settle(() => lastRequest().respond(201, SUCCESS));
    expect(screen.getByText(/Enviado · na fila de processamento/)).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('uploads one file at a time, in the order they were added', async () => {
    render(<UploadPanel />);

    dropFiles([audio('first.mp3'), audio('second.mp3')]);

    expect(FakeXhr.instances).toHaveLength(1);
    expect(screen.getByText('Aguardando')).toBeInTheDocument();

    await settle(() => lastRequest().respond(201, SUCCESS));

    expect(FakeXhr.instances).toHaveLength(2);
    expect((lastRequest().body?.get('files') as File).name).toBe('second.mp3');
  });

  it('refuses unsupported formats and oversized files without contacting the server', () => {
    render(<UploadPanel />);

    dropFiles([audio('virus.exe'), audio('huge.mp3', 60 * 1024 * 1024 + 1)]);

    expect(FakeXhr.instances).toHaveLength(0);
    expect(screen.getByText('Formato não suportado')).toBeInTheDocument();
    expect(screen.getByText('O arquivo tem mais de 60 MB')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument();
  });

  it('still uploads the valid files of a mixed drop', () => {
    render(<UploadPanel />);

    dropFiles([audio('virus.exe'), audio('good.mp3')]);

    expect(FakeXhr.instances).toHaveLength(1);
    expect((lastRequest().body?.get('files') as File).name).toBe('good.mp3');
  });

  it('shows the server message and lets the user try again', async () => {
    render(<UploadPanel />);
    dropFiles([audio('A - B.mp3')]);

    await settle(() =>
      lastRequest().respond(400, { error: { code: 'TOO_MANY_FILES', message: 'Muitos arquivos' } }),
    );
    expect(screen.getByText('Muitos arquivos')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(FakeXhr.instances).toHaveLength(2);
    await settle(() => lastRequest().respond(201, SUCCESS));
    expect(screen.getByText(/Enviado · na fila/)).toBeInTheDocument();
  });

  it('explains connection failures', async () => {
    render(<UploadPanel />);
    dropFiles([audio('A - B.mp3')]);

    await settle(() => lastRequest().failNetwork());

    expect(screen.getByText('Falha de conexão durante o envio')).toBeInTheDocument();
  });

  it('keeps going with the next file after one fails', async () => {
    render(<UploadPanel />);
    dropFiles([audio('first.mp3'), audio('second.mp3')]);

    await settle(() => lastRequest().failNetwork());

    expect(FakeXhr.instances).toHaveLength(2);
    expect((lastRequest().body?.get('files') as File).name).toBe('second.mp3');
  });

  it('clears the finished items but keeps the ones still in progress', async () => {
    render(<UploadPanel />);
    dropFiles([audio('first.mp3'), audio('second.mp3')]);
    await settle(() => FakeXhr.instances[0]?.respond(201, SUCCESS));

    fireEvent.click(screen.getByRole('button', { name: 'Limpar concluídos' }));

    const list = screen.getByRole('region', { name: 'Arquivos enviados' });
    expect(within(list).queryByText('first.mp3')).not.toBeInTheDocument();
    expect(within(list).getByText('second.mp3')).toBeInTheDocument();
  });

  it('uploads without a profile when none is selected', () => {
    useProfileStore.setState({ currentProfile: null });
    render(<UploadPanel />);

    dropFiles([audio('A - B.mp3')]);

    expect(lastRequest().formKeys()).toEqual(['files']);
  });

  it('highlights the drop area while dragging over it', () => {
    render(<UploadPanel />);
    const zone = screen.getByTestId('dropzone');

    fireEvent.dragOver(zone);
    expect(zone).toHaveClass('border-primary');

    fireEvent.dragLeave(zone);
    expect(zone).not.toHaveClass('border-primary');
  });

  it('mentions the folder that can be used instead', () => {
    render(<UploadPanel />);
    expect(screen.getByText('storage/entrada/upload')).toBeInTheDocument();
  });
});
