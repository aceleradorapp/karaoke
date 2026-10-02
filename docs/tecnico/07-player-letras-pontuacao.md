# 07 — Player, letras e pontuação

> Partes mais delicadas do projeto. Siga os trechos de código; desvios exigem uma justificativa no log.

## 7.1 Tela do player (`/player/:songId`)

```
┌───────────────────────────────────────────────────────────────┐
│ [capa desfocada ao fundo, escurecida 70%]                     │
│                                                               │
│  🎤 Michael                                Evidências         │
│                                            Chitãozinho & X.   │
│                                                               │
│            ● ● ●   (contagem antes da 1ª linha)               │
│                                                               │
│        E nessa loucura de dizer que não te quero              │ ← linha atual (grande, preenchimento por palavra)
│          vou negando as aparências                            │ ← próxima linha (menor, 60% de opacidade)
│                                                               │
│  [afinação ▁▃▅▇ ao vivo]                       Nota: 82       │ ← só com o microfone ativo (Fase 7)
│ ───────────────●──────────────────────────  1:12 / 4:35       │
│  ⏮  ⏯  ⏭     🗣 Voz guia [OFF]   🔊 ───●──   ⚙ letra ±       │ ← some após 3 s sem mexer o mouse
└───────────────────────────────────────────────────────────────┘
```

### Antes de começar: "Quem vai cantar esta?"
Overlay com o perfil atual pré-selecionado e os outros perfis em linha (o convidado também pode ser escolhido). Botão **Começar** (Enter). Isso cria a `Performance` (`POST /performances`) com o perfil escolhido.

**Vindo da fila de cantores** (`?pedido=<requestId>`, ADR-008): o título vira **"Vez de Ana! 🎤"** e quem pediu já vem selecionado (dá para trocar). O `POST /performances` leva o `requestId`, e o pedido sai da fila. Se o pedido não existir mais (removido em outro lugar), o player funciona como uma música avulsa.

**Fim da música e a fila de cantores:** fora de uma playlist, se houver um pedido com música pronta, a tela de fim mostra "A seguir: João — Azul da Cor do Mar" e o botão **Chamar o próximo** (`/player/<songId>?pedido=<id>`, substituindo a página atual). A playlist tem prioridade quando o player foi aberto por ela.

### Atalhos de teclado
| Tecla | Ação |
|---|---|
| Espaço | Pausar/continuar |
| V | Liga/desliga a voz guia |
| ← / → | −5 s / +5 s |
| ↑ / ↓ | Volume ±10% |
| [ / ] | Atraso da letra −100 ms / +100 ms (salva em `lyricsOffsetMs` ao sair) |
| E | Liga/desliga o efeito de pintar a letra |
| N | Próxima música (playlist) |
| Esc | Sair (confirma se estiver no meio) |
| F | Tela cheia (`document.documentElement.requestFullscreen()`) |

## 7.2 Motor de áudio (`lib/audio/KaraokeEngine.ts`)

**Por que Web Audio e não dois `<audio>`:** dois elementos `<audio>` dessincronizam com o tempo; com Web Audio, as duas fontes começam no mesmo instante do relógio do `AudioContext` (sincronia de amostra).

```ts
export class KaraokeEngine {
  readonly ctx = new AudioContext({ latencyHint: 'interactive' });   // público: o microfone usa o mesmo contexto (7.5)
  private master = this.ctx.createGain();
  private vocalGain = this.ctx.createGain();
  private instBuf?: AudioBuffer; private vocBuf?: AudioBuffer;
  private instSrc?: AudioBufferSourceNode; private vocSrc?: AudioBufferSourceNode;
  private startedAt = 0;   // ctx.currentTime correspondente a offset 0
  private pausedAt = 0;    // posição (s) quando pausado
  playing = false;
  onEnded?: () => void;

  constructor() {
    this.vocalGain.gain.value = 0;            // voz guia DESLIGADA por padrão
    this.vocalGain.connect(this.master);
    this.master.connect(this.ctx.destination);
  }

  async load(instrumentalUrl: string, vocalsUrl: string | null) {
    const fetchBuf = async (u: string) =>
      this.ctx.decodeAudioData(await (await fetch(u)).arrayBuffer());
    [this.instBuf, this.vocBuf] = await Promise.all([
      fetchBuf(instrumentalUrl),
      vocalsUrl ? fetchBuf(vocalsUrl) : Promise.resolve(undefined),
    ]);
  }

  get duration() { return this.instBuf?.duration ?? 0; }

  /** posição atual em segundos — fonte da verdade para letra e pontuação */
  get currentTime() {
    return this.playing ? this.ctx.currentTime - this.startedAt : this.pausedAt;
  }

  play(from = this.pausedAt) {
    if (!this.instBuf) return;
    this.stopSources();
    const when = this.ctx.currentTime + 0.05;   // pequena folga para iniciar as duas juntas
    this.instSrc = this.ctx.createBufferSource();
    this.instSrc.buffer = this.instBuf;
    this.instSrc.connect(this.master);
    this.instSrc.onended = () => { if (this.playing && this.currentTime >= this.duration - 0.1) { this.playing = false; this.onEnded?.(); } };
    this.instSrc.start(when, from);
    if (this.vocBuf) {
      this.vocSrc = this.ctx.createBufferSource();
      this.vocSrc.buffer = this.vocBuf;
      this.vocSrc.connect(this.vocalGain);
      this.vocSrc.start(when, from);
    }
    this.startedAt = when - from;
    this.playing = true;
    void this.ctx.resume();
  }

  pause() { if (!this.playing) return; this.pausedAt = this.currentTime; this.playing = false; this.stopSources(); }
  seek(t: number) { const clamped = Math.max(0, Math.min(t, this.duration - 0.1)); this.playing ? this.play(clamped) : (this.pausedAt = clamped); }
  setVoiceGuide(on: boolean) { this.vocalGain.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.05); }
  setVolume(v: number) { this.master.gain.value = v; }
  destroy() { this.stopSources(); void this.ctx.close(); }

  private stopSources() {
    for (const s of [this.instSrc, this.vocSrc]) { if (s) { s.onended = null; try { s.stop(); } catch {} s.disconnect(); } }
    this.instSrc = this.vocSrc = undefined;
  }
}
```
- Mostre "Carregando música…" durante o `load` (≈ 1–3 s, decodifica cerca de 170 MB de PCM; aceitável no PC).
- `AudioContext` só inicia após um gesto do usuário: o botão **Começar** do overlay resolve isso.
- **Fim da música:** `onEnded` → fluxo de pontuação (7.6).
- **Playlist:** ao terminar e após a tela de nota, vai para `?i=i+1` automaticamente (com 5 s de contagem e o botão "Cantar agora").

## 7.3 Letra (`lib/lyrics/` + `features/player/LyricsView.tsx`)

### Fonte do tempo
Loop de `requestAnimationFrame` lê `t = engine.currentTime - song.lyricsOffsetMs/1000 - liveOffset`. **Não** use estado React por frame para tudo: atualize a linha atual por estado (muda poucas vezes) e o preenchimento por **variável CSS via ref** (muda a cada frame).

### Encontrar a linha atual
```ts
// lines ordenadas por start; busca binária
export function findLineIndex(lines: LyricLine[], t: number): number {
  let lo = 0, hi = lines.length - 1, ans = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (lines[mid].start <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
  return ans; // -1 = antes da primeira linha
}
```
(Testes unitários obrigatórios.)

### Efeito de pintar a letra (modelos)
O efeito é uma função registrada em `frontend/src/lib/lyrics/effects.ts` (`LYRICS_EFFECTS`), que recebe a linha, o tempo e o `fillPercent` e devolve o progresso (0..1) de cada palavra; o `LyricsView` só aplica o resultado em `--p`. Para criar um modelo novo: acrescentar o id em `shared/src/lyricsEffects.ts` e implementar `progress` no registro (o TypeScript obriga a implementar todos).
- **Liga/desliga** e **modelo** são globais (`player.lyricsEffectEnabled`, `player.lyricsEffect` em `/api/settings`). Desligado = todas as palavras com `--p:1` assim que a linha começa.
- **`fillPercent`** é por música (`songs.fillPercent`, padrão 100): o começo da linha não muda; o instante em que termina de pintar é `start + (end − start) × fillPercent/100` (menor = termina antes). Aparece no player e na página de sincronizar.
- Modelos: `smooth` (Preencher aos poucos, padrão): barra contínua repartida entre as palavras pelo número de letras; `words` (Palavra por palavra): cada palavra fica inteira colorida quando chega a sua parte da linha (a primeira, no instante em que a linha começa). Com `words` vindos do Whisper, usam-se os tempos reais de cada palavra, também escalados pelo `fillPercent`.

### Preenchimento progressivo (modelo `smooth`)
- **Com `words`:** cada palavra é um `<span>`; a palavra atual recebe `--p` (0→1) = `(t - w.start)/(w.end - w.start)`; as anteriores, `--p:1`.
- **Sem `words` (LRCLIB por linha):** preenchimento da linha inteira com `--p = (t - line.start) / (line.end - line.start)`, limitado a 0..1.
- CSS do efeito karaokê:
```css
.lyric-fill {
  background: linear-gradient(90deg, var(--lyric-sung) calc(var(--p) * 100%), var(--lyric-unsung) calc(var(--p) * 100%));
  -webkit-background-clip: text; background-clip: text; color: transparent;
  text-shadow: none;
}
```
- Tipografia: linha atual `font-display`, `clamp(2rem, 4.5vw, 4rem)`, centralizada, com até 2 linhas visuais; a próxima com 60% do tamanho e `opacity: .6`. Transição suave (translateY + opacity, 250 ms) ao trocar de linha.

### Contagem
Se a próxima linha começa em ≤ 3 s e a anterior terminou há ≥ 4 s (ou é a primeira), mostre 3 bolinhas que se apagam uma por segundo.

### Casos sem letra sincronizada
- `PLAIN`: mostrar o texto inteiro rolando lentamente na velocidade `duration / nº de linhas` e um aviso discreto "Letra sem sincronia".
- `NONE`: mensagem "Letra não encontrada" + capa grande; o áudio toca normalmente.

## 7.4 Editor de letra (Fase 6) — `/musica/:id/letra`
Três abas:
1. **Texto:** textarea com a letra (uma linha por verso). Botões: "Buscar de novo" (`/lyrics/search`) e "Sincronizar com IA" (`/lyrics/align` com o texto).
2. **Sincronizar na mão ("tap"):** toca a música; a linha destacada é a próxima a marcar; **Espaço** marca o `start` da linha atual e avança; **Backspace** volta uma linha; ← volta 5 s. O `end` de cada linha = o `start` da seguinte.
3. **Ajuste fino:** lista de linhas com o tempo editável (± 0,1 s) e o botão ▶ para ouvir a partir dela.

Salvar → `PUT /songs/:id/lyrics` (`LyricsDoc` com `source=MANUAL`). As palavras são descartadas se o texto da linha mudou.

## 7.5 Pontuação por afinação (Fase 7) — `lib/pitch/`

### Captura do microfone (somente no palco, em localhost)
```ts
const stream = await navigator.mediaDevices.getUserMedia({
  audio: { deviceId: micDeviceId ?? undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
});
const src = engine.ctx.createMediaStreamSource(stream);      // mesmo AudioContext do player
const analyser = engine.ctx.createAnalyser(); analyser.fftSize = 2048;
src.connect(analyser);                                       // NÃO conectar ao destination (sem retorno nas caixas)
```
> `echoCancellation: false` é importante: com ela ligada, o navegador "limpa" a voz e distorce a afinação. Se a caixa de som vazar muito no microfone, o instrumental (sem voz) gera pouca interferência, porque a melodia de referência é só da voz.

### Detecção (pitchy, a cada 20 ms)
```ts
import { PitchDetector } from 'pitchy';
const buf = new Float32Array(analyser.fftSize);
const detector = PitchDetector.forFloat32Array(analyser.fftSize);

function sample(): number | null {          // retorna MIDI ou null
  analyser.getFloatTimeDomainData(buf);
  const rms = Math.sqrt(buf.reduce((s, x) => s + x * x, 0) / buf.length);
  if (rms < 0.01) return null;              // silêncio
  const [freq, clarity] = detector.findPitch(buf, engine.ctx.sampleRate);
  if (clarity < 0.85 || freq < 70 || freq > 1100) return null;
  return 69 + 12 * Math.log2(freq / 440);
}
```
Use `setInterval(…, 20)` enquanto toca (o rAF pode cair para 30 fps; o intervalo é mais estável para amostragem).

### Comparação com a referência (`melodia.json`)
```ts
export class PitchScorer {
  private total = 0; private points = 0;
  constructor(private ref: { step: number; start: number; midi: (number | null)[] }, private latencySec: number) {}

  /** t = engine.currentTime; singer = MIDI ou null */
  add(t: number, singer: number | null) {
    const idx = Math.round((t - this.latencySec - this.ref.start) / this.ref.step);
    const r = this.ref.midi[idx];
    if (r == null) return;                   // trecho sem voz na original: não conta
    this.total++;
    if (singer == null) return;              // devia cantar e não cantou: 0 ponto
    const diff = Math.abs((((singer - r) % 12) + 18) % 12 - 6);  // distância em semitons, ignorando a oitava (0..6)
    this.points += diff <= 0.5 ? 1 : diff <= 1 ? 0.75 : diff <= 2 ? 0.35 : 0;
  }

  /** 0..100. Curva generosa: amadores raramente passam de 80% de acerto bruto. */
  get score() {
    if (this.total < 50) return null;        // < 1 s de voz na referência: sem nota
    const raw = this.points / this.total;    // 0..1
    return Math.round(Math.min(1, raw / 0.8) ** 0.8 * 100);
  }
  get live() { return this.score ?? 0; }
}
```
- **Ignorar a oitava** é essencial (crianças e mulheres cantando música de voz masculina e vice-versa).
- Medidor ao vivo: barra mostrando a nota alvo × a nota cantada (opcional, mas legal) + nota parcial.
- Testes unitários do `PitchScorer` com dados sintéticos (afinado = ~100; meio tom = ~75–85; aleatório = baixa; silêncio = 0).

### Calibração da latência (configurações)
Botão "Calibrar": toca 4 bipes curtos pelas caixas e mede quando o microfone os capta (pico de RMS); latência = média(captado − emitido). Salva `scoring.micLatencyMs`. Fallback: slider manual de 0–400 ms.

## 7.6 Fluxo de fim de música e votação (ADR-006)

```
engine.onEnded
  → completed = currentTime >= 0.9 * duration
  → pitchScore = (modo inclui afinação && microfone ativo && song.hasMelody) ? scorer.score : null
  → POST /performances/:id/finish { completed, voiceGuideUsed, pitchScore }
     ├─ resposta { voting: { endsAt } } → TELA DE VOTAÇÃO no palco:
     │     "Plateia, deem sua nota pelo celular!"  ⏱ 20 s  • 3 votos   (vote:progress)
     │     (QR code pequeno no canto, para quem ainda não entrou)
     │     ← score:final
     └─ resposta { finalScore } → direto para a TELA DE NOTA
TELA DE NOTA: contador animado de 0 até a nota, estrelas, frase por faixa:
   95+ "Lenda do karaokê!" · 85+ "Arrasou!" · 70+ "Mandou bem!" · 50+ "Tá no caminho!" · <50 "O importante é se divertir!"
   detalhamento: 🎯 Afinação 78 · 👏 Plateia 92 (5 votos)
   confete em ≥ 85 (CSS puro ou canvas simples, sem biblioteca pesada)
   [Cantar de novo] [Próxima] [Voltar]
```
- Se o usuário sair no meio (Esc), chama `finish` com `completed=false` e **sem votação/nota**.
- Voz guia ligada em algum momento → `voiceGuideUsed=true` (aparece no histórico com o ícone 🗣; **não** penaliza a nota no MVP).

### Celular (`/m/votar`)
- Ao receber `vote:open` (ou ao abrir a página e `GET /performances/voting/current` retornar algo): tela cheia com o avatar, o nome de quem cantou, a música, **5 estrelas grandes** e a contagem regressiva.
- `voterToken`: UUID gerado uma vez e salvo em `localStorage` (`caraoke.voterToken`).
- `voterProfileId`: a identidade do celular (ADR-008). Quem está cantando vê "É a sua vez! A plateia está votando" em vez das estrelas (o backend também recusa com `CANNOT_VOTE_FOR_SELF`).
- Depois de votar: "Obrigado! 🎉" até chegar o `score:final`, que mostra a nota final por 5 s e volta para a aba anterior.

## 7.7 Estado do player (`usePlayerStore`)
```ts
{
  songId, profileId, performanceId,
  status: 'choosing-singer' | 'loading' | 'playing' | 'paused' | 'voting' | 'score' | 'error',
  voiceGuide: boolean, voiceGuideUsed: boolean, volume: number, liveOffsetMs: number,
  playlist?: { id: string; index: number; songIds: string[] },
  result?: { pitchScore, audienceScore, finalScore, votes },
}
```
O `KaraokeEngine` **não** fica no store (não é serializável): guarde-o num `useRef` no componente `PlayerPage` e destrua-o no unmount.
