# ADR-007 — Cancelamento e recuperação de jobs

- **Status:** aceita
- **Data:** 2026-10-01

## Contexto
O processamento de uma música leva minutos e roda em outro processo (worker). O usuário pode cancelar a qualquer momento, o worker ou o back-end podem cair no meio, e o arquivo de origem (upload) não pode ser perdido nem ficar sendo relido por um processo que já deveria ter parado.

## Decisão
- **O estado é do banco, o worker só obedece.** Cancelar marca o job como `CANCELED` na hora (a música vai para `ERROR`). O worker descobre na próxima chamada de progresso (`cancel: true`), mata o Demucs e confirma chamando `fail` com `CANCELED`.
- **A origem só é movida quando ninguém a lê.** Cancelar um job *aguardando* move o arquivo para `erro/` na hora. Cancelar um job *em execução* não mexe no arquivo (no Windows ele estaria travado pelo Demucs); a confirmação do worker é que move.
- **Conclusão atrasada é descartada.** Se o worker concluir um job já cancelado, os arquivos gerados são apagados e a origem vai para `erro/`.
- **Retry cria um job novo** (o antigo fica no histórico), reaproveitando o caminho da origem; upload sem arquivo → `SOURCE_UNAVAILABLE`.
- **Recuperação ao iniciar o back-end:** jobs `RUNNING` voltam para a fila, no máximo **3 tentativas**; depois falham com mensagem clara (uma música "venenosa" não trava a fila).
- **Recuperação quando o worker reinicia:** o worker manda um `instanceId` novo a cada processo. Se mudar com o back-end no ar, os jobs `RUNNING` órfãos voltam para a fila. O worker só começa a pegar jobs depois do primeiro heartbeat confirmado (sem corrida).
- **Progresso limitado:** no máximo 1 atualização por segundo por job (worker) e 1 publicação a cada 500 ms (back-end), exceto troca de etapa e 100%.
- `moveToError`/`deleteOriginFile` recusam qualquer caminho fora de `storage/` (e diretórios e vazio).

## Consequências
- Cancelar é instantâneo para o usuário e seguro mesmo se o worker estiver travado.
- Um job pode ser reprocessado do zero após queda (aceitável: o processamento é idempotente e os arquivos finais só são publicados no fim).
- Verificado com vídeos reais: cancelar durante a separação encerra os processos do Demucs em segundos, e "tentar de novo" conclui normalmente.
