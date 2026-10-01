import { UploadPanel } from './UploadPanel';

export function UploadPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <h1 className="font-display text-4xl text-text sm:text-5xl">Enviar músicas</h1>
      <UploadPanel />
    </div>
  );
}
