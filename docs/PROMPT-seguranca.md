# PROMPT - Rodada de segurança (tasks 063-068)

> Uso: prompt de um agente que implementa **uma** das tasks 063-068 (`docs/tasks/`). O revisor preenche `<NNN>` e `<WORKTREE>`.
> Derivado de `PROMPT-estatisticas.md` em 2026-09-28. Origem dos achados: a revisão de segurança pré-deploy de 2026-09-28 (códigos M-1, M-2, M-4, M-5, B-3 a B-6, B-8 e B-10). Cada task cita o seu.

---

Você está no repo `meus-livros` (Nuxt 4 + Vue 3 `<script setup>` + TypeScript `strict`, better-auth, Drizzle 0.45 + postgres.js, Vitest, ESLint Nuxt). Produto: biblioteca de leituras pt-BR para uma turma de ~30 amigos, só por convite. Esta rodada fecha achados de segurança antes do primeiro deploy.

Sua task é a **TASK-<NNN>**: `docs/tasks/<NNN>-*.md`. Leia a task inteira, inclusive "Explicitly excluded", e depois `CLAUDE.md` (seções Conventions, Security, Testing, Git e "Things that will look like bugs but are deliberate") e `docs/agent-prompts/repo-state.md`. Leia também todo arquivo que a task manda ler antes de escrever.

## 0. Onde trabalhar

- **Somente dentro de `<WORKTREE>`**, na branch já criada ali. Nunca edite `C:\Users\diogo\Documents\meus-livros` (checkout do dono, com `npm run dev` rodando).
- Nada de `git checkout`, `switch`, `merge`, `rebase`, `push`, `stash`. Não toque em `develop` nem em `main`.
- Ao terminar: **exatamente um commit** na branch, mensagem conventional em inglês (`fix(auth): ...`, `fix(catalog): ...`), adicionando só os caminhos que você alterou (`git add <caminho>`, nunca `-A` nem `.`). Não commite `PROMPT.md`.
- Outras cinco tasks rodam ao mesmo tempo, cada uma dona de arquivos diferentes. **Toque somente nos arquivos listados em "Expected files" da sua task.** Se precisar de outro, pare e relate.

## 1. O que você NÃO roda

Build, dev server, `npm install`, `npm run test`, `npx vitest`, typecheck, lint, migrations, e qualquer coisa que toque banco ou rede. O worktree não tem `node_modules`. O revisor roda tudo depois, num worktree de verificação. Para ler o fonte de uma biblioteca (better-auth, drizzle-orm, zod, h3), use `C:\Users\diogo\Documents\ml-verify\node_modules`, só leitura. Comandos permitidos: `git status/diff/log/add/commit`, leitura de arquivos, `grep`, `ls`.

## 2. Proibições

1. Não leia `.env*`, segredos, nem `process.env` com valores reais. Não imprima connection strings.
2. `v-html` é banido.
3. `app/**` nunca importa de `server/**`, nem tipo. Contrato compartilhado mora em `shared/`.
4. Sem `any` (use `unknown` e narrowing), sem `console.log`, sem comentário explicativo no código (o repo não tem comentários; a justificativa vai no relatório).
5. Nada de dependência nova no `package.json`.
6. Nenhuma migration. Nenhuma tabela nova.

## 3. Backend

- Rotas finas: validar (Zod, `parseOrThrow`), autorizar, chamar o serviço, responder. **Só `server/services/**` importa `db`.**
- Toda leitura de `reading_logs` passa por `visibleLogs(viewer)` de `server/services/visibility.ts`, com o `innerJoin(users, ...)` que ele exige. Leituras do próprio dono filtradas por `user_id` da sessão são a exceção que já existe.
- Recurso privado responde **404, nunca 403**. Dado de catálogo é público e pode responder 403. Erro: `createError({ statusCode, data: { error: 'codigo_snake_case', message: 'Mensagem em português.' } })`.
- As tabelas do better-auth (`ba_user`, `session`, `account`, `verification`) são do better-auth. `session."userId"` e `account."userId"` apontam para **`ba_user.id`**, nunca para `users.id`. Alcance-as por `ba_user.email`.
- Erro do Drizzle chega embrulhado em `DrizzleQueryError`, com o erro do Postgres em `cause`.
- Nenhum log grava senha, hash, código OTP, token de sessão ou e-mail sem redação (`redactEmail` em `server/utils/email.ts`).

## 4. Testes

Vitest. Integração usa o banco via `DATABASE_URL`, com `describe.skipIf(!hasDatabaseUrl)` quando o arquivo já segue esse padrão. Siga os fixtures do próprio arquivo que você estender (`removeFixtures` de `tests/integration/fixtures.ts`, marcador único). Nenhum teste dispara e-mail de verdade: veja como `tests/integration/auth.test.ts` já evita isso. **Todo teste novo precisa falhar no código de hoje**; diga no relatório qual asserção falharia e por quê. Sem snapshot, sem E2E. Escreva o teste; o revisor roda.

## 5. Relatório

Sua mensagem final é o relatório, e só ele:

```
ARQUIVOS: <um por linha, + novo, ~ alterado>
CRITERIOS: <um por linha: FEITO | NAO FEITO | INCERTO - motivo>
DECISOES: <o que um revisor questionaria>
RISCOS: <o que pode estar errado no seu trabalho, em especial tipos que você não conferiu>
FORA DE ESCOPO NOTADO: <o que viu e não tocou>
```

`CRITERIOS` fala do que você implementou, não do que testou. `INCERTO` é melhor que otimismo.
