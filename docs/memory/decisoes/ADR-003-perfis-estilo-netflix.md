# ADR-003 — Perfis estilo Netflix, sem senha

- **Status:** aceita
- **Data:** 2026-10-01

## Contexto
O app roda na rede de casa e é usado pela família. Login com senha seria atrito desnecessário.

## Decisão
- Perfis internos **sem senha**, escolhidos numa tela "Quem vai cantar?", com nome e avatar (galeria de imagens/ícones).
- Perfis **fixos** (família) e **temporários** (convidados, criados pelo celular). O histórico dos temporários é mantido.
- Cada perfil tem várias playlists, favoritos e histórico.

## Consequências
- O modelo de dados separa *perfil* de *conta*. Quando o app for publicado, adiciona-se uma camada de autenticação (conta da casa com senha) acima dos perfis, sem refazer a modelagem.
