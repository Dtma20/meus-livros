# Situação dos achados da revisão de segurança de 2026-09-28

- Revisão original: [security-review-2026-09-28.md](security-review-2026-09-28.md), escrita contra `d618e70`.
- Conferida contra `develop` em `7b1acff`, em 2026-09-30, só por leitura: nada executado, nada editado.
- Entre as duas datas entraram as tasks 063-068 e as correções `2ee32ee`, `ffa0f7b` e `541ac29`.
- Três pontos foram conferidos de novo à mão: A-1 (`readJsonBody` e `genericOtpResponse` em `server/services/auth.ts`), B-2 (`server/services/catalog.ts`) e o resíduo do M-1 (`server/services/invites.ts` não apaga as linhas de `verification`).

## A-1: corrigido

As duas variantes do ataque agora recebem a mesma resposta para qualquer endereço:

- **`Content-Type` diferente de `application/json`:** `readJsonBody` devolve `null`, e a rota responde `400 requisicao_invalida`. Isso acontece antes do rate limit e antes de qualquer consulta à allowlist.
- **Campo `type` ausente ou diferente de `sign-in`:** o schema recusa, com o mesmo 400 para todos.
- **Pedido encaminhado ao better-auth:** `forwardOtpRequest` monta os próprios headers e o próprio corpo, descarta a resposta do better-auth e devolve sempre `genericOtpResponse()`. `forget-password` segue o mesmo caminho.

Resíduo: só uma diferença de tempo, porque o ramo encaminhado ainda executa `resolveOTP` e `findUserByEmail`. Não foi medida. O critério de tempo já está no checklist da TASK-024.

## Tabela

| ID | Sev. | Status | Evidência | Notas |
|---|---|---|---|---|
| A-1 | ALTO | Corrigido | `9ba2aab`; `auth.ts` `readJsonBody`, `forwardOtpRequest`, `genericOtpResponse` | Diferença de tempo não medida (024) |
| M-1 | MÉDIO | Corrigido, com resíduo | `dd36e58` (063); `invites.ts` `removeInvite` | Apaga as sessões e a conta `credential`. Resíduos: o cache de sessão de 5 min, que é deliberado, e as linhas de `verification`, que não são apagadas. Um código de login emitido antes da remoção vale por até 10 min em `/sign-in/email-otp`, rota que encaminha o pedido sem checar a allowlist |
| M-2 | MÉDIO | Corrigido | `9e2025f` (066); `catalog.ts` | O 403 revela ao criador que outra pessoa usa a edição, mesmo em registro privado. Oráculo parecido com o B-2 |
| M-3 | MÉDIO | Corrigido | `f939bba`; `library-transfer.ts` | Arquivo exportado antes da correção não tem o campo e é importado como `publico` |
| M-4 | MÉDIO | Parcial | `ca64f53` (067); `import.post.ts` | 3 importações × 1000 livros dão até 3000 obras por hora, contra 30 no fluxo normal. É o limite que a 067 especificou. `author` ainda aceita até 500 caracteres |
| M-5 | MÉDIO | Corrigido | `ca64f53`; `rate-limit.ts` | Chaves em SHA-256, limpeza, checagens sequenciais. `server/api/auth/[...all].ts` continua fora do `defineApiHandler`, então um erro de banco no wrapper cai no handler do Nitro |
| M-6 | MÉDIO | Corrigido | `9ba2aab`; o logger em `auth.ts` | O logger próprio omite o SQL. O formato real numa falha de banco não foi verificado |
| B-1 | BAIXO | Corrigido | `ac79d46`; `reading-blocks.ts` | `innerJoin(users)` |
| B-2 | BAIXO | **Aberto** | `catalog.ts` `deleteWork` | Conta os registros sem `visibleLogs`. Nenhuma task cobre |
| B-3 | BAIXO | Corrigido | `066e13a` (064) | Set-password sem checar o handle é deliberado (064) |
| B-4 | BAIXO | Corrigido | `066e13a` | Limite de 10/h e `hasPassword` antes do scrypt |
| B-5 | BAIXO | Parcial | `ca64f53`; `rate-limit.ts` | Trancar a conta exige 50 tentativas por hora de pelo menos 5 IPs. Depende de o `x-forwarded-for` não ser forjável na Vercel: não verificado |
| B-6 | BAIXO | Corrigido | `5ecdf8b` (068) | |
| B-7 | BAIXO | Corrigido | `9ba2aab` | `parseJsonObject` recusa `null` e array |
| B-8 | BAIXO | Corrigido | `4b7c6bc` (065) | |
| B-9 | BAIXO | Corrigido | `ac79d46`; `feed.ts` | `z.iso.datetime()` |
| B-10 | BAIXO | Corrigido para anônimo | `5ecdf8b` | Membro logado fica sem limite, por decisão (068) |
| B-11 | BAIXO | Corrigido | `ac79d46`; `api.ts` | Procura o erro do Postgres em `cause` |
| Obs. `name`/`image` | - | Aberto | `auth.ts`, `sign-in/email-otp` | O corpo ainda é encaminhado cru |

## O que ainda está aberto

Precisa de task nova:

1. **B-2, junto com o 403 do M-2:** contar só registros visíveis, ou responder igual nos dois casos.
2. **Resíduo do M-1:** `removeInvite` apagar as linhas de `verification` do endereço, ou `/sign-in/email-otp` e `/email-otp/reset-password` checarem a allowlist.
3. **`server/api/auth/[...all].ts`:** envolver num tratamento de erro, para que um erro de banco não chegue ao Nitro.
4. **`/sign-in/email-otp`:** remontar o corpo só com `email` e `otp`.
5. **M-4:** limitar `author` a 300 e decidir se 3000 obras por hora é aceitável. Se for, registrar em `docs/security.md`.
6. **M-3:** decidir a visibilidade padrão de um arquivo antigo sem o campo, que hoje é `publico`.

Já coberto pela 024: a medição de tempo do A-1 e a auditoria de logs do M-6. A confirmação do `x-forwarded-for` na Vercel (B-5) só está implícita e vale explicitar lá.
