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
- Commits só quando o Michael pedir. Remote: `origin` = https://github.com/aceleradorapp/karaoke.git (branch `main`). Push só com pedido explícito.
- Permissões (`.claude/settings.json`): acesso amplo liberado pelo Michael; `git push`, `git reset --hard`, `git clean` e apagar pastas recursivamente pedem confirmação.
- Nunca commitar segredos (`.env`). Nunca tocar nos outros bancos do XAMPP (`family_manager_dev`, `furabucho_db`, `tissflow_db`).

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
