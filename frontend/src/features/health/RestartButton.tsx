import { RotateCw } from 'lucide-react';
import { useState } from 'react';
import { useRestartSystemMutation } from '../../api/health';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useRestartStore } from '../../stores/useRestartStore';
import { toast } from '../../stores/useToastStore';

export function RestartButton({ canRestart }: { canRestart: boolean }) {
  const restart = useRestartSystemMutation();
  const markRestarting = useRestartStore((state) => state.markRestarting);
  const [isConfirming, setIsConfirming] = useState(false);

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        variant="secondary"
        onClick={() => setIsConfirming(true)}
        disabled={!canRestart}
        isLoading={restart.isPending}
      >
        <RotateCw aria-hidden="true" className="size-5" />
        Reiniciar o sistema
      </Button>
      <p className="text-sm text-muted">
        {canRestart
          ? 'Desliga e liga de novo o servidor e o processador de músicas. Leva alguns segundos; quem estiver usando o celular reconecta sozinho.'
          : 'Disponível só no modo festa (npm run festa). Agora o sistema está no modo de desenvolvimento: reinicie pela janela "Karaoke - sistema".'}
      </p>
      <ConfirmDialog
        isOpen={isConfirming}
        title="Reiniciar o sistema"
        message="A música que estiver tocando para e as músicas em preparação recomeçam depois. Reiniciar agora?"
        confirmLabel="Reiniciar"
        dismissLabel="Cancelar"
        onConfirm={() => {
          setIsConfirming(false);
          restart.mutate(undefined, {
            onSuccess: markRestarting,
            onError: (error) =>
              toast.error(error instanceof Error ? error.message : 'Não foi possível reiniciar'),
          });
        }}
        onCancel={() => setIsConfirming(false)}
      />
    </div>
  );
}
