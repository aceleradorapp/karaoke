import { QRCodeSVG } from 'qrcode.react';
import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useAccessQuery, useRegenerateAccessMutation } from '../../api/system';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { Spinner } from '../../components/Spinner';
import { toast } from '../../stores/useToastStore';

const QR_SIZE = 320;

interface AccessQrModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function AccessContent() {
  const access = useAccessQuery(true);
  const regenerate = useRegenerateAccessMutation();
  const [chosenUrl, setChosenUrl] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  if (access.isLoading) return <Spinner className="mx-auto my-10 size-10" />;
  if (access.isError || !access.data) {
    return (
      <p role="alert" className="text-danger">
        Não foi possível gerar o QR code.
      </p>
    );
  }

  const { code, urls } = access.data;
  const url = chosenUrl && urls.includes(chosenUrl) ? chosenUrl : urls[0];

  function confirmRegenerate() {
    regenerate.mutate(undefined, {
      onSuccess: () => {
        setIsConfirming(false);
        setChosenUrl(null);
        toast.success('Código novo gerado. Os celulares precisam escanear de novo.');
      },
      onError: () => toast.error('Não foi possível gerar um código novo'),
    });
  }

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      {url ? (
        <>
          <p className="text-base">Aponte a câmera do celular para o código abaixo.</p>
          <div className="w-full max-w-80 rounded-2xl bg-white p-3" data-testid="qr-code">
            <QRCodeSVG
              value={url}
              size={QR_SIZE}
              level="M"
              marginSize={2}
              title={`Endereço para o celular: ${url}`}
              className="h-auto w-full"
            />
          </div>
          <p className="break-all text-sm text-muted">{url}</p>
          {urls.length > 1 && (
            <label className="flex w-full flex-col gap-1 text-left text-sm text-muted">
              Outro endereço (se o celular não abrir)
              <select
                value={url}
                onChange={(event) => setChosenUrl(event.target.value)}
                className="min-h-11 rounded-lg bg-surface-2 px-3 text-base text-text"
              >
                {urls.map((item) => (
                  <option key={item} value={item}>
                    {new URL(item).host}
                  </option>
                ))}
              </select>
            </label>
          )}
        </>
      ) : (
        <p role="alert" className="text-base text-danger">
          O PC não está conectado a uma rede. Conecte-o ao Wi-Fi ou ao cabo da casa para o celular encontrar o
          app.
        </p>
      )}

      <p className="text-base">
        Código: <strong className="font-display text-2xl tracking-widest">{code}</strong>
      </p>
      <p className="text-sm text-muted">O celular precisa estar no mesmo Wi-Fi que este PC.</p>

      {isConfirming ? (
        <div
          role="group"
          aria-label="Confirmar código novo"
          className="flex w-full flex-col gap-3 rounded-xl bg-surface-2 p-4"
        >
          <p className="text-base">Os celulares conectados vão sair e precisar escanear o QR code de novo.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button onClick={confirmRegenerate} isLoading={regenerate.isPending}>
              Sim, gerar código novo
            </Button>
            <Button variant="secondary" onClick={() => setIsConfirming(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" onClick={() => setIsConfirming(true)}>
          <RefreshCw aria-hidden="true" className="size-5" />
          Gerar novo código
        </Button>
      )}
    </div>
  );
}

export function AccessQrModal({ isOpen, onClose }: AccessQrModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      title="Usar o celular"
      onClose={onClose}
      footer={<Button onClick={onClose}>Fechar</Button>}
    >
      {isOpen && <AccessContent />}
    </Modal>
  );
}
