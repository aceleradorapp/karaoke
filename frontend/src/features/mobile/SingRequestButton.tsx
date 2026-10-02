import type { SingRequestDTO } from '@caraoke/shared';
import { Check, Mic } from 'lucide-react';
import { useAddSingRequestMutation, useRemoveSingRequestMutation } from '../../api/singQueue';
import { Button } from '../../components/Button';
import { toast } from '../../stores/useToastStore';

interface SingRequestButtonProps {
  songId: string;
  songTitle: string;
  profileId: string;
  myRequest: SingRequestDTO | undefined;
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function SingRequestButton({ songId, songTitle, profileId, myRequest }: SingRequestButtonProps) {
  const addRequest = useAddSingRequestMutation();
  const removeRequest = useRemoveSingRequestMutation();

  if (myRequest) {
    return (
      <Button
        variant="secondary"
        aria-label={`Tirar ${songTitle} da fila`}
        isLoading={removeRequest.isPending}
        onClick={() =>
          removeRequest.mutate(
            { id: myRequest.id, profileId },
            { onError: (error) => toast.error(messageOf(error, 'Não foi possível tirar da fila')) },
          )
        }
      >
        <Check aria-hidden="true" className="size-5" />
        Na fila
      </Button>
    );
  }

  return (
    <Button
      aria-label={`Quero cantar ${songTitle}`}
      isLoading={addRequest.isPending}
      onClick={() =>
        addRequest.mutate(
          { profileId, songId },
          {
            onSuccess: () => toast.success('Você está na fila para cantar'),
            onError: (error) => toast.error(messageOf(error, 'Não foi possível entrar na fila')),
          },
        )
      }
    >
      <Mic aria-hidden="true" className="size-5" />
      Quero cantar
    </Button>
  );
}
