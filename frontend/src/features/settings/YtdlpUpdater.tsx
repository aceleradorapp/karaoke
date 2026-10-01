import { RefreshCw } from 'lucide-react';
import { useSystemInfoQuery, useUpdateYtdlpMutation } from '../../api/system';
import { Button } from '../../components/Button';
import { toast } from '../../stores/useToastStore';

export function YtdlpUpdater() {
  const systemInfo = useSystemInfoQuery();
  const updateYtdlp = useUpdateYtdlpMutation();
  const installedVersion = systemInfo.data?.worker.ytdlpVersion;

  function handleUpdate() {
    updateYtdlp.mutate(undefined, {
      onSuccess: ({ version }) => toast.success(`yt-dlp atualizado para a versão ${version}`),
      onError: (error) => toast.error(error.message),
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-base font-medium">Downloader do YouTube (yt-dlp)</span>
      <p className="text-sm text-muted">Versão em uso: {installedVersion ?? 'desconhecida'}</p>
      <Button
        variant="secondary"
        onClick={handleUpdate}
        isLoading={updateYtdlp.isPending}
        className="self-start"
      >
        <RefreshCw aria-hidden="true" className="size-5" />
        Atualizar yt-dlp
      </Button>
      <p className="text-sm text-muted">
        Use quando a busca ou o download do YouTube parar de funcionar. Depois de atualizar, reinicie o
        sistema para o download usar a nova versão.
      </p>
    </div>
  );
}
