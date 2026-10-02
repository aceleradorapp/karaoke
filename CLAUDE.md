# CLAUDE.md — caraoke-michael

Guia para o Claude Code neste repositório. **Leia antes de qualquer tarefa.**

## Visão geral
App de karaokê para a família do Michael: buscar músicas no YouTube (ou enviar arquivos), remover o vocal com IA, sincronizar a letra e cantar na TV, com perfis estilo Netflix, playlists, pontuação e o celular como controle.
Roda em um PC da casa, na rede local.

## Onde está cada coisa
| Caminho | Conteúdo |
|---|---|
| `docs/roadmap/ROADMAP.md` | **Tarefas** por fase, com status, docs de referência e modelo sugerido |
| `docs/tecnico/` | **Documento técnico**: a fonte da verdade (arquitetura, banco, API, worker, front, player, celular, convenções) |
| `docs/memory/contexto.md` | Visão, requisitos, hardware, decisões menores |
| `docs/memory/decisoes/` | ADRs (decisões e o porquê) |
| `docs/memory/log-sessoes.md` | Diário das sessões |
| `docs/memory/sincronizacao-da-letra.md` | **Guia da sincronização da letra** (alinhamento, página de sincronizar, efeito de pintar, números medidos, armadilhas, o que falta). Leia antes de mexer em letra |
| `docs/specs/` | Specs de funcionalidades **novas** que ainda não estão no documento técnico |
| `vault/` | Ideias, pesquisas, referências (Obsidian) |
| `frontend/` `backend/` `shared/` `worker/` | Código (criado na Fase 0) |
| `storage/` | Áudios e arquivos gerados (não versionado) |

## Protocolo de trabalho (para qualquer modelo)
1. Abra o `docs/roadmap/ROADMAP.md` e pegue a **primeira tarefa ⬜** da fase atual (ou a que o Michael indicar).
2. Leia **só** as seções do documento técnico referenciadas na tarefa + `docs/tecnico/09-convencoes.md`.
3. Marque a tarefa como 🟨, implemente **apenas o escopo dela**, teste de verdade.
4. Siga o checklist (Definition of Done) de `09-convencoes.md §9.5`. Marque ✅ com a data.
5. Se o documento técnico não cobrir algo, estiver errado ou se contradisser: **pare e pergunte**. Depois de decidido, corrija o documento.
6. Tarefas marcadas 🔴 são delicadas: se você for um modelo mais simples, avise o Michael antes de começar.
7. **Não pare a cada tarefa**: encadeie as tarefas necessárias até concluir uma parte importante (normalmente a fase inteira), resuma e só então pergunte ao Michael se pode continuar. Pare antes se houver contradição no documento, decisão faltando ou ação destrutiva.
8. Ao final da sessão: `/fim-sessao`.

## Regras
- **Layout responsivo SEMPRE** (celular → TV), em toda tela. Ver `docs/tecnico/06-frontend.md §6.9`.
- **Auto-save por padrão**: botão de salvar só quando for realmente necessário (criar registro, ação destrutiva). Ver `§6.10`.
- **Clean Code**: variáveis, métodos, classes e arquivos em **inglês**; **evitar comentários no código** (só quando realmente necessário). Ver `09-convencoes.md §9.2`.
- Conversa e documentação em **português**; textos da UI em pt-BR.
- Não adicionar dependências fora das listadas no documento técnico sem registrar o porquê.
- Não tomar decisões de arquitetura sozinho: propor → discutir → ADR.
- **Git**: ver "Fluxo de branches" abaixo. Commit, push e merge de fim de fase estão autorizados pelo Michael (ele pediu para não pedir aprovações).
- Permissões (`.claude/settings.json`): permissão total liberada pelo Michael (sem lista de confirmação). Não peça aprovação para executar tarefas; use bom senso em ações destrutivas e force-push.
- Nunca commitar segredos (`.env`). Nunca tocar nos outros bancos do XAMPP (`family_manager_dev`, `furabucho_db`, `tissflow_db`).

## Fluxo de branches
Remote: `origin` = https://github.com/aceleradorapp/karaoke.git
- `main`: sempre estável (só recebe merge de `develop` quando uma fase está verificada).
- `develop`: integração; toda branch de trabalho nasce dela.
- `feature/f<N>-<nome-curto>`: uma branch por **fase** (ex.: `feature/f1-perfis-e-temas`), criada a partir de `develop`. Tarefas muito grandes ou arriscadas podem ter branch própria: `feature/f2-04-jobs`.
- Um **commit por tarefa** do roadmap, em português, no formato Conventional Commits, com rodapé `Tarefa: F1-03`. Faça push da branch a cada tarefa concluída.
- Ao fim da fase: rodar typecheck, testes e a verificação da fase (F*-08 etc.); estando tudo verde, mergear em `develop` (`--no-ff`) e depois `develop` em `main`, dar push das duas, resumir ao Michael e perguntar se pode seguir para a próxima fase (a nova branch nasce de `develop`).
- Nunca commitar direto em `main` ou `develop` (exceto o merge de fim de fase).

## Ambiente
- Windows 11 · Node 24 · Python 3.11 (venv em `worker/.venv`) · FFmpeg · MariaDB 10.4 (XAMPP, `root` sem senha, banco `caraoke`)
- `C:\xampp\mysql\bin\mysql.exe -u root caraoke` para consultas manuais.

## Comandos do projeto
```powershell
npm install               # dependências JS (workspaces)
npm run worker:setup      # cria o venv do Python e instala as dependências de IA
npm run db:migrate        # migrations Prisma
npm run db:seed           # settings padrão + perfil inicial
npm run dev               # api (3333) + web (5173) + worker
npm test                  # testes TS
npm run typecheck
worker\.venv\Scripts\python -m pytest worker
```
*(Disponíveis a partir da tarefa F0-06; atualize esta seção se mudarem.)*

## Comandos do Claude (`.claude/commands/`)
- `/proxima-tarefa` — pega a próxima tarefa do roadmap e executa o protocolo
- `/nova-spec <nome>` — cria uma spec a partir do template
- `/nova-decisao <título>` — registra um ADR
- `/fim-sessao` — atualiza o log, o roadmap e o contexto
