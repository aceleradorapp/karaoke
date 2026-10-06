import {
  describeEta,
  estimateQueue,
  formatEta,
  type JobDTO,
  type LyricsAvailability,
  type SongDTO,
} from '@caraoke/shared';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { KaraokeApiError, type KaraokeApi, type SongOrder } from './karaokeApi.js';

interface ToolResult {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

const LYRICS_LABELS: Record<LyricsAvailability, string> = {
  SYNCED: 'sincronizada',
  PLAIN: 'só o texto (sem sincronizar)',
  INSTRUMENTAL: 'instrumental (sem voz)',
  NONE: 'não encontrada',
  UNKNOWN: 'não deu para verificar agora',
};

const SONG_STATUS_LABELS: Record<SongDTO['status'], string> = {
  QUEUED: 'na fila de processamento',
  PROCESSING: 'processando',
  READY: 'pronta para cantar',
  ERROR: 'com erro',
};

const LIBRARY_LYRICS_LABELS: Record<SongDTO['lyricsSource'], string> = {
  LRCLIB: 'sincronizada',
  ALIGNED: 'sincronizada',
  MANUAL: 'sincronizada à mão',
  TRANSCRIBED: 'transcrita pela IA',
  PLAIN: 'só o texto',
  NONE: 'sem letra',
};

const ORDERS: Record<string, SongOrder> = {
  recentes: 'recent',
  titulo: 'title',
  artista: 'artist',
  mais_cantadas: 'popular',
};

const RECENT_JOBS_SHOWN = 10;
const SECONDS_PER_MINUTE = 60;

function formatDuration(totalSeconds: number | null | undefined): string {
  if (!totalSeconds) return '?:??';
  const seconds = Math.round(totalSeconds);
  return `${Math.floor(seconds / SECONDS_PER_MINUTE)}:${String(seconds % SECONDS_PER_MINUTE).padStart(2, '0')}`;
}

function text(lines: string[]): ToolResult {
  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

async function safely(run: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await run();
  } catch (error) {
    const message = error instanceof KaraokeApiError || error instanceof Error ? error.message : String(error);
    return { content: [{ type: 'text', text: `Erro: ${message}` }], isError: true };
  }
}

function describeJob(job: JobDTO, eta?: string): string {
  const status =
    job.status === 'RUNNING'
      ? (job.message ?? `processando (${job.progress}%)`)
      : job.status === 'PENDING'
        ? 'aguardando'
        : job.status === 'DONE'
          ? 'pronta'
          : job.status === 'FAILED'
            ? `falhou: ${job.error ?? 'erro desconhecido'}`
            : 'cancelada';
  const parts = [`${job.song.title} — ${job.song.artist}`, status];
  if (eta) parts.push(eta.toLowerCase());
  parts.push(`job_id ${job.id}`);
  return parts.join(' · ');
}

export function registerKaraokeTools(server: McpServer, api: KaraokeApi): void {
  server.registerTool(
    'buscar_youtube',
    {
      title: 'Buscar no YouTube',
      description:
        'Busca vídeos no YouTube para o karaokê. Para cada resultado diz se a música já está na biblioteca e se ' +
        'tem letra (sincronizada, só texto ou não encontrada). Use o youtube_id, o artista e o título sugeridos ' +
        'para importar. Dica: inclua "karaoke" no termo para achar versões instrumentais.',
      inputSchema: {
        termo: z.string().min(1).max(100).describe('O que buscar, por exemplo "evidências karaoke"'),
        limite: z.number().int().min(1).max(25).optional().describe('Quantos resultados (padrão 10)'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ termo, limite }) =>
      safely(async () => {
        const { items } = await api.searchYoutube(termo, limite ?? 10);
        if (items.length === 0) return text([`Nenhum vídeo encontrado para "${termo}".`]);
        const lyrics = await Promise.all(
          items.map((video) =>
            api.checkLyrics(video.suggested.artist, video.suggested.title, video.durationSec).catch(() => 'UNKNOWN' as const),
          ),
        );
        return text([
          `Resultados para "${termo}":`,
          ...items.map((video, index) =>
            [
              `${index + 1}. ${video.title} (${formatDuration(video.durationSec)})`,
              `canal ${video.channel}`,
              `sugestão: artista "${video.suggested.artist}", título "${video.suggested.title}"`,
              `letra: ${LYRICS_LABELS[lyrics[index] ?? 'UNKNOWN']}`,
              video.existingSongId ? 'JÁ ESTÁ NA BIBLIOTECA' : 'não está na biblioteca',
              `youtube_id ${video.youtubeId}`,
              `duracao_seg ${video.durationSec}`,
            ].join(' · '),
          ),
        ]);
      }),
  );

  server.registerTool(
    'verificar_letra',
    {
      title: 'Verificar letra',
      description:
        'Verifica no LRCLIB (o mesmo site que o karaokê usa) se uma música tem letra sincronizada. Informar a ' +
        'duração ajuda: versões com duração muito diferente da original costumam ficar sem letra.',
      inputSchema: {
        artista: z.string().max(200),
        titulo: z.string().min(1).max(200),
        duracao_seg: z.number().int().positive().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ artista, titulo, duracao_seg }) =>
      safely(async () => {
        const status = await api.checkLyrics(artista, titulo, duracao_seg);
        return text([`Letra de "${titulo}" (${artista || 'artista não informado'}): ${LYRICS_LABELS[status]}.`]);
      }),
  );

  server.registerTool(
    'buscar_na_biblioteca',
    {
      title: 'Buscar na biblioteca',
      description:
        'Lista as músicas que já estão no karaokê. Sem termo, lista todas na ordem pedida; ' +
        '"mais_cantadas" mostra as mais cantadas da família.',
      inputSchema: {
        termo: z.string().max(100).optional().describe('Parte do título ou do artista'),
        ordem: z.enum(['recentes', 'titulo', 'artista', 'mais_cantadas']).optional(),
        limite: z.number().int().min(1).max(50).optional().describe('Padrão 20'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ termo, ordem, limite }) =>
      safely(async () => {
        const { items } = await api.listSongs(termo?.trim() || undefined, ORDERS[ordem ?? 'recentes'] ?? 'recent', limite ?? 20);
        if (items.length === 0) return text([termo ? `Nada na biblioteca com "${termo}".` : 'A biblioteca está vazia.']);
        return text(
          items.map((song, index) =>
            [
              `${index + 1}. ${song.title} — ${song.artist}`,
              SONG_STATUS_LABELS[song.status],
              `letra: ${LIBRARY_LYRICS_LABELS[song.lyricsSource]}`,
              `cantada ${song.playCount} ${song.playCount === 1 ? 'vez' : 'vezes'}`,
              ...(song.youtubeId ? [`youtube_id ${song.youtubeId}`] : []),
            ].join(' · '),
          ),
        );
      }),
  );

  server.registerTool(
    'importar_musicas',
    {
      title: 'Importar músicas',
      description:
        'Importa uma ou várias músicas do YouTube para o karaokê. Elas entram na fila de processamento (separar ' +
        'a voz, buscar a letra etc.). Use os dados de buscar_youtube. Confirme com a pessoa antes de importar muitas.',
      inputSchema: {
        musicas: z
          .array(
            z.object({
              youtube_id: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
              artista: z.string().min(1).max(200),
              titulo: z.string().min(1).max(200),
              duracao_seg: z.number().int().positive().optional(),
            }),
          )
          .min(1)
          .max(25),
      },
    },
    async ({ musicas }) =>
      safely(async () => {
        const lines: string[] = [];
        for (const song of musicas) {
          const label = `${song.titulo} — ${song.artista}`;
          try {
            const result = await api.importSong({
              youtubeId: song.youtube_id,
              artist: song.artista,
              title: song.titulo,
              ...(song.duracao_seg ? { durationSec: song.duracao_seg } : {}),
            });
            lines.push(result.alreadyExists ? `• ${label}: já estava na biblioteca` : `• ${label}: entrou na fila`);
          } catch (error) {
            lines.push(`• ${label}: não importada (${error instanceof Error ? error.message : String(error)})`);
          }
        }
        return text(['Importação:', ...lines, 'Use fila_de_processamento para acompanhar.']);
      }),
  );

  server.registerTool(
    'fila_de_processamento',
    {
      title: 'Fila de processamento',
      description:
        'Mostra o que está sendo processado e o que espera na fila, com o tempo estimado, e as músicas ' +
        'concluídas ou que falharam nas últimas 48 horas.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () =>
      safely(async () => {
        const [active, recent, estimate] = await Promise.all([
          api.listJobs('active'),
          api.listJobs('recent'),
          api.estimate(),
        ]);
        const eta = estimateQueue(active, estimate, Date.now());
        const lines: string[] = [];
        if (active.length === 0) lines.push('Nada sendo processado agora.');
        else {
          lines.push(`Fila (tudo pronto em ${formatEta(eta.allReadyInSec)}, estimativa):`);
          for (const job of active) {
            const jobEta = eta.byJob.get(job.id);
            lines.push(`• ${describeJob(job, jobEta ? describeEta(jobEta) : undefined)}`);
          }
        }
        if (recent.length > 0) {
          lines.push('', 'Últimas 48 h:');
          for (const job of recent.slice(0, RECENT_JOBS_SHOWN)) lines.push(`• ${describeJob(job)}`);
        }
        return text(lines);
      }),
  );

  server.registerTool(
    'cancelar_processamento',
    {
      title: 'Cancelar processamento',
      description: 'Cancela uma música que está na fila de processamento (use o job_id de fila_de_processamento).',
      inputSchema: { job_id: z.string().min(1) },
      annotations: { destructiveHint: true },
    },
    async ({ job_id }) =>
      safely(async () => {
        await api.cancelJob(job_id);
        return text([`Processamento ${job_id} cancelado.`]);
      }),
  );

  server.registerTool(
    'reordenar_fila',
    {
      title: 'Reordenar a fila',
      description:
        'Muda a ordem das músicas que AGUARDAM na fila de processamento. Passe os job_id na ordem desejada; ' +
        'as que ficarem de fora vão para o fim, na ordem atual.',
      inputSchema: { job_ids: z.array(z.string().min(1)).min(1).max(500) },
    },
    async ({ job_ids }) =>
      safely(async () => {
        const { ids } = await api.reorderJobs(job_ids);
        const active = await api.listJobs('active');
        const byId = new Map(active.map((job) => [job.id, job]));
        return text([
          'Nova ordem da fila:',
          ...ids.map((id, index) => `${index + 1}. ${byId.get(id)?.song.title ?? id}`),
        ]);
      }),
  );
}
