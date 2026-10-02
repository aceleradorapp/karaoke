import { UploadPanel } from '../upload/UploadPanel';

export function MobileUploadPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-3xl">Enviar músicas</h1>
      <UploadPanel isCompact />
    </div>
  );
}
