# ADR-002 — MySQL como banco de dados

- **Status:** aceita
- **Data:** 2026-10-01

## Contexto
O projeto precisa de banco para perfis, playlists, músicas, histórico e fila de processamento. O Michael já tem MySQL instalado.

## Opções consideradas
1. **SQLite** — zero configuração, mas pior para acesso concorrente (TV + vários celulares + worker) e para publicar depois.
2. **MySQL** — já disponível, aguenta concorrência e serve tanto para uso local quanto publicado.
3. **Postgres** — equivalente ao MySQL, mas exigiria instalar algo novo.

## Decisão
**MySQL**, acessado pelo back-end Node por meio de um ORM (Prisma ou Drizzle, a decidir).

> Na prática é o **MariaDB 10.4.32 do XAMPP** (compatível com MySQL), em `localhost:3306`, usuário `root` sem senha, banco `caraoke`.

## Consequências
- O mesmo banco serve do MVP até a publicação.
- O worker Python lê e atualiza o status dos jobs pelo mesmo banco (ou pela API do Node, a decidir).
