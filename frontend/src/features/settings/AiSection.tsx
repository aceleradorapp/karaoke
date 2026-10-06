import { Bot, Copy, Download, KeyRound, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useAiKeyQuery, useGenerateAiKeyMutation, useRevokeAiKeyMutation } from '../../api/aiKey';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { formatTimeAgo } from '../../lib/format';
import { toast } from '../../stores/useToastStore';
import { SettingsSection } from './fields';

const KEY_PLACEHOLDER = '<sua chave>';
const FALLBACK_SERVER_URL = 'http://<ip-do-pc-do-karaoke>:3333';
const MCP_FILE_PATH = 'C:\\karaoke\\caraoke-mcp.mjs';

export function claudeCodeCommand(serverUrl: string, key: string): string {
  return `claude mcp add karaoke -e CARAOKE_URL=${serverUrl} -e CARAOKE_KEY=${key} -- node ${MCP_FILE_PATH}`;
}

export function claudeDesktopConfig(serverUrl: string, key: string): string {
  const config = {
    mcpServers: {
      karaoke: { command: 'node', args: [MCP_FILE_PATH], env: { CARAOKE_URL: serverUrl, CARAOKE_KEY: key } },
    },
  };
  return JSON.stringify(config, null, 2);
}

async function copy(text: string, what: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copiado`);
  } catch {
    toast.error('Não foi possível copiar; selecione o texto e copie à mão');
  }
}

function CopyBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{label}</span>
        <Button variant="ghost" onClick={() => void copy(text, label)} aria-label={`Copiar ${label}`}>
          <Copy aria-hidden="true" className="size-4" />
          Copiar
        </Button>
      </div>
      <pre className="overflow-x-auto rounded-lg bg-bg p-3 text-xs leading-relaxed">{text}</pre>
    </div>
  );
}

type PendingAction = 'replace' | 'revoke' | null;

export function AiSection() {
  const status = useAiKeyQuery();
  const generate = useGenerateAiKeyMutation();
  const revoke = useRevokeAiKeyMutation();
  const [shownKey, setShownKey] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const serverUrl = status.data?.serverUrls[0] ?? FALLBACK_SERVER_URL;
  const key = shownKey ?? KEY_PLACEHOLDER;

  function createKey() {
    generate.mutate(undefined, {
      onSuccess: (created) => setShownKey(created.key),
      onError: () => toast.error('Não foi possível gerar a chave'),
    });
  }

  function confirmPendingAction() {
    if (pendingAction === 'replace') createKey();
    if (pendingAction === 'revoke') {
      revoke.mutate(undefined, {
        onSuccess: () => {
          setShownKey(null);
          toast.success('Chave revogada: a IA não consegue mais usar o karaokê');
        },
        onError: () => toast.error('Não foi possível revogar a chave'),
      });
    }
    setPendingAction(null);
  }

  return (
    <SettingsSection title="IA (MCP)">
      <p className="text-base text-muted">
        Deixe o Claude (Desktop ou Code) buscar músicas no YouTube, ver se têm letra, importar e cuidar da fila de
        processamento, conversando no chat. Funciona neste PC e nos outros computadores da casa.
      </p>

      {status.data?.hasKey && !shownKey && (
        <p className="flex items-center gap-2 text-base">
          <KeyRound aria-hidden="true" className="size-5 text-accent" />
          Chave criada {status.data.createdAt ? formatTimeAgo(status.data.createdAt) : ''}. Ela só aparece na hora em
          que é gerada.
        </p>
      )}

      {shownKey && (
        <div role="status" className="flex flex-col gap-2 rounded-xl border border-accent/40 p-3">
          <p className="text-sm font-semibold text-accent">Guarde agora: esta chave não aparece de novo.</p>
          <CopyBlock label="Chave para IA" text={shownKey} />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {status.data?.hasKey ? (
          <>
            <Button variant="secondary" onClick={() => setPendingAction('replace')} disabled={generate.isPending}>
              <KeyRound aria-hidden="true" className="size-5" />
              Trocar chave
            </Button>
            <Button variant="ghost" onClick={() => setPendingAction('revoke')} disabled={revoke.isPending}>
              <Trash2 aria-hidden="true" className="size-5" />
              Revogar
            </Button>
          </>
        ) : (
          <Button onClick={createKey} disabled={generate.isPending || status.isLoading}>
            <Bot aria-hidden="true" className="size-5" />
            Gerar chave para IA
          </Button>
        )}
      </div>

      <details className="flex flex-col gap-3">
        <summary className="min-h-11 cursor-pointer content-center text-base font-semibold">
          Como ligar no Claude
        </summary>
        <ol className="flex list-decimal flex-col gap-4 pl-5 text-sm">
          <li className="flex flex-col gap-2">
            <span>
              No PC onde está o Claude, instale o Node.js e baixe o arquivo do MCP para{' '}
              <code className="rounded bg-bg px-1">{MCP_FILE_PATH}</code>:
            </span>
            <a
              href={status.data?.mcpDownloadPath ?? '/downloads/caraoke-mcp.mjs'}
              download
              className="inline-flex min-h-11 w-fit items-center gap-2 rounded-lg bg-surface-2 px-4 font-semibold"
            >
              <Download aria-hidden="true" className="size-5" />
              Baixar caraoke-mcp.mjs
            </a>
          </li>
          <li className="flex min-w-0 flex-col gap-2">
            <span>No Claude Code, rode no terminal:</span>
            <CopyBlock label="Comando do Claude Code" text={claudeCodeCommand(serverUrl, key)} />
          </li>
          <li className="flex min-w-0 flex-col gap-2">
            <span>
              Ou, no Claude Desktop, acrescente em Configurações › Desenvolvedor › Editar configuração
              (claude_desktop_config.json) e reinicie o app:
            </span>
            <CopyBlock label="Configuração do Claude Desktop" text={claudeDesktopConfig(serverUrl, key)} />
          </li>
          <li>
            Depois é só pedir, por exemplo: “liste 10 músicas sertanejas famosas para karaokê, veja quais têm letra e
            importe as que tiverem”.
          </li>
        </ol>
      </details>

      <ConfirmDialog
        isOpen={pendingAction !== null}
        title={pendingAction === 'revoke' ? 'Revogar a chave para IA' : 'Trocar a chave para IA'}
        message={
          pendingAction === 'revoke'
            ? 'A IA deixará de conseguir usar o karaokê até você gerar uma chave nova.'
            : 'A chave atual para de funcionar e você precisará colocar a nova no Claude.'
        }
        confirmLabel={pendingAction === 'revoke' ? 'Revogar' : 'Trocar chave'}
        dismissLabel="Voltar"
        onConfirm={confirmPendingAction}
        onCancel={() => setPendingAction(null)}
      />
    </SettingsSection>
  );
}
