# 09 — Convenções e checklist

## 9.1 Idioma
| O quê | Idioma |
|---|---|
| Identificadores (variáveis, funções, arquivos de código, tabelas, rotas da API) | **Inglês** |
| Rotas do front (URLs que o usuário vê) | Português (`/biblioteca`, `/fila`…) |
| Textos da interface, mensagens de erro, toasts | **Português do Brasil** |
| Comentários no código | **Evitar.** Só quando realmente necessário (um "porquê" que o código não consegue expressar); nesse caso, em inglês e curtos |
| Documentação (`docs/`) | Português |
| Mensagens de commit | Português, no formato Conventional Commits |

## 9.2 Código

### Clean Code (padrão obrigatório)
- **Inglês** em todos os identificadores: variáveis, funções, métodos, classes, arquivos, tabelas, campos, rotas da API.
- **Nomes que dispensam comentário**: `calculateFinalScore(pitch, audience)`, e não `calc(a, b) // calcula nota`. Booleans com `is/has/should/can` (`isGuest`, `hasVocals`).
- **Sem comentários óbvios.** Se sentir necessidade de comentar o "o quê", renomeie ou extraia uma função. Comentário só para um "porquê" não óbvio (ex.: um workaround de biblioteca, uma limitação de hardware).
- **Funções pequenas, com uma responsabilidade**; no máximo 3 parâmetros (acima disso, use um objeto).
- **Early return** em vez de `if` aninhados.
- **Sem números mágicos**: constantes nomeadas (`const VOTE_DURATION_SECONDS = 20`).
- **Sem código morto**, sem `console.log` esquecido, sem código comentado.
- **DRY sem exagero**: extraia quando houver repetição real (3×), não por antecipação.
- Separação clara: rotas (HTTP) → services (regra) → Prisma (dados); componentes de UI sem regra de negócio (use hooks).

> Os trechos de código do documento técnico têm comentários **explicativos para quem lê o doc**. Não copie esses comentários para o código: siga as regras acima.

### Ferramentas e tipagem
- **TypeScript estrito** (`"strict": true`, `noUncheckedIndexedAccess: true`). Proibido usar `any` (use `unknown` + validação).
- ESM em todo lugar (`"type": "module"`).
- Validação de entrada **sempre** com Zod (back) e tipos do `@caraoke/shared` (front).
- Componentes React: função + hooks; um componente por arquivo; arquivos `PascalCase.tsx`; hooks `useAlgo.ts`.
- Estilo: classes Tailwind usando os **tokens de tema** (`bg-surface`, `text-primary`…). **Nunca** cores fixas em componentes (só nos temas).
- Python: 3.11, type hints, `pathlib`, `logging` (nunca `print`), funções pequenas por etapa.
- Formatação: Prettier (TS, `singleQuote: true`, `printWidth: 110`) e ruff format (Python).
- Sem dependências novas fora das listadas no documento técnico sem registrar o porquê no log da sessão.

## 9.2.1 Regras de UX permanentes (preferências do Michael)
0. **Clean Code**: identificadores em inglês, evitar comentários (ver §9.2).
1. **Layout responsivo sempre**: toda tela, inclusive as do palco, funciona do celular (375 px) à TV (1920 px). Ver T-06 §6.9.
2. **Auto-save por padrão**: edições salvam sozinhas, com o indicador "Salvo ✓". Botão de salvar/confirmar só para criar registros ou para ações destrutivas. Ver T-06 §6.10.

## 9.3 Testes (mínimo exigido)
| Onde | O quê |
|---|---|
| shared | `parseLrc`, `toLrc`, `parseYoutubeTitle` |
| backend | Plugin de acesso, `computeFinalScore`, claim de job, reordenação de fila, services de playlist |
| frontend | `findLineIndex`, `PitchScorer` |
| worker | `clean_title`, parser de LRC, `resolve_device`, parser de progresso do Demucs (pytest) |

Rodar: `npm test` (TS) e `worker\.venv\Scripts\python -m pytest worker` (Python).

## 9.4 Commits
```
feat(player): voz guia com ganho separado
fix(worker): fallback para CPU quando falta VRAM
docs(roadmap): marca F2-04 como concluída
chore: atualiza dependências
```
- Um commit por tarefa do roadmap (ou por parte lógica dela).
- Rodapé com o ID da tarefa: `Tarefa: F2-04`.
- Commitar **somente quando o Michael pedir**, ou quando ele tiver autorizado o commit por tarefa.

## 9.5 Checklist de cada tarefa (Definition of Done)
1. Li a tarefa no roadmap **e** as seções do documento técnico que ela referencia.
2. Implementei **só** o escopo da tarefa (nada de "já que estou aqui…").
3. `npm run typecheck` e `npm test` passam (e o pytest, se mexi no worker).
4. Testei de verdade (rodando o app ou o script), não só compilei.
4.1. Tarefas de front: conferi a responsividade (375 / 768 / 1366 / 1920 px) e o auto-save dos campos editáveis.
5. Atualizei o roadmap: ⬜ → ✅ com a data.
6. Se tomei alguma decisão não prevista: registrei no log da sessão e, se for relevante, propus um ADR.
7. Se algo do documento técnico se mostrou errado ou inviável: **corrigi o documento** e avisei.

## 9.6 Quando parar e perguntar
- O documento técnico não cobre o caso, ou se contradiz.
- Uma dependência listada não funciona e a alternativa muda a arquitetura.
- A tarefa exigiria mudar o schema do banco além do previsto.
- Algo destrutivo: apagar dados, mudar o `.env` do Michael, mexer em outros bancos do XAMPP (**nunca** tocar em `family_manager_dev`, `furabucho_db`, `tissflow_db`).
