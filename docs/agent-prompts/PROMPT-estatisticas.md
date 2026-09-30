# PROMPT - Estatísticas de leitura (tasks 060-062)

> Uso: prompt de um agente que implementa **uma** das tasks 060-062 (`docs/tasks/`). O revisor preenche `<NNN>` e `<WORKTREE>`.
> Derivado de `PROMPT-frontend-melhorias.md` em 2026-09-28. Diferença: a TASK-060 mexe em `server/**` e `shared/**`; as regras de backend estão na seção 3.

---

Você está no repo `meus-livros` (Nuxt 4 + Vue 3 `<script setup>` + TypeScript `strict`, Drizzle + Postgres, Vitest, ESLint Nuxt). Produto: biblioteca de leituras pt-BR, tema escuro, estilo Letterboxd, para uma turma de ~30 amigos que abre links pelo navegador interno do WhatsApp.

Sua task é a **TASK-<NNN>**: `docs/tasks/<NNN>-*.md`. Leia a task inteira, inclusive "Explicitly excluded", e depois `CLAUDE.md` (seções Conventions, Security, Testing, Git) e `docs/agent-prompts/repo-state.md`. Leia também os arquivos que a task manda ler antes de escrever.

## 0. Onde trabalhar

- **Somente dentro de `<WORKTREE>`**, na branch já criada ali. Nunca edite `C:\Users\diogo\Documents\meus-livros` (é o checkout do dono, com `npm run dev` rodando).
- Nada de `git checkout`, `switch`, `merge`, `rebase`, `push`, `stash`. Não toque em `develop` nem `main`.
- Ao terminar: **exatamente um commit** na branch, mensagem conventional em inglês (`feat(stats): ...`), adicionando só os caminhos que você alterou (`git add <caminho>`, nunca `-A` / `.`). Não comite `PROMPT.md`.

## 1. O que você NÃO roda

Build, dev server, `npm install`, `npm run test`, typecheck, lint, migrations, qualquer coisa que toque banco ou rede. O revisor roda tudo depois, num worktree de verificação. Comandos permitidos: `git status/diff/log/mv/add/commit`, leitura de arquivos, `grep`.

## 2. Proibições

1. Não leia `.env*`, segredos, `process.env` com valores reais. Não imprima connection strings.
2. Toque **somente** nos arquivos listados em "Expected files" da sua task. Outra task roda em paralelo.
3. `v-html` é banido.
4. `app/**` nunca importa de `server/**`, nem tipo. Contrato compartilhado mora em `shared/`.
5. Sem `any` (use `unknown` + narrowing), sem `console.log`, sem comentário explicativo no código (o repo não tem comentários; a justificativa vai no relatório), sem cor ou medida que duplique token de `app/assets/css/tokens.css`.
6. Nada de dependência nova no `package.json`. Gráficos são CSS/SVG feitos à mão (decisão do dono).
7. Se precisar de algo fora do escopo, **pare e relate**.

## 3. Backend (TASK-060)

- Rotas finas: validar (Zod, `parseOrThrow`) → autorizar → chamar serviço → responder. **Só `server/services/**` importa `db`.**
- Toda leitura de `reading_logs` passa por `visibleLogs(viewer)` de `server/services/visibility.ts`. Ele referencia `users.profile_visibility`, então a query precisa do `innerJoin(users, ...)`.
- Recurso privado responde **404, nunca 403**. Erro: `createError({ statusCode, data: { error: 'codigo_snake_case', message: 'Mensagem em português.' } })`.
- `reading_logs.rating` é `numeric` e chega como string: converta para `number`.
- `finished_on` é `date` (string `YYYY-MM-DD`); ano de leitura = `EXTRACT(YEAR FROM finished_on)`.
- Teste de integração usa o banco via `DATABASE_URL` e `describe.skipIf(!hasDatabaseUrl)`; siga `tests/integration/profile.test.ts` (fixtures com marcador único e `removeFixtures` no `afterAll`).

## 4. Frontend (TASK-061, TASK-062)

- `RatingInput` é `role="slider"` de propósito. `BookCard` é um `<a>` único. `BookCover` exige `alt`.
- **Rótulos e números em SSR nunca vêm de `Intl` nem de `toLocaleString`**: Node e Chrome divergem e a hidratação quebra. Separador de milhar `.` feito à mão.
- Breakpoints só em CSS (`@media`), nunca `matchMedia` decidindo o DOM.
- Sem `window` / `document` / `localStorage` no topo do `setup()`; composables do Nuxt antes de qualquer `await`.
- Páginas públicas usam `await useAsyncData` (sem o `await`, 404 vira 200).
- `$fetch` no cliente com `timeout`; GET com `retry: 0`.
- Alvo de toque ≥ `var(--target-min-size)` (44px). 320px sem scroll horizontal da página. `prefers-reduced-motion` desliga animação.
- Toda lista: loading, erro (com retry, sem stack) e vazio (com ação). Copy em pt-BR, falando com um amigo.
- Sem light theme, sem Pinia. CSP em `nuxt.config.ts`: não afrouxe.

## 5. Testes

Vitest. Unitário para lógica pura e componentes (`// @vitest-environment happy-dom` na primeira linha; stubs `vi.hoisted` de `tests/unit/routes.test.ts` / `profile-page.test.ts` para `useRoute`/`navigateTo`/`useId`/`useAsyncData`). Sem snapshot, sem E2E. Escreva o teste; o revisor roda.

## 6. Relatório

Sua mensagem final é o relatório, e só ele:

```
ARQUIVOS: <um por linha, + novo, ~ alterado, > movido>
CRITERIOS: <um por linha: FEITO | NAO FEITO | INCERTO - motivo>
DECISOES: <o que um revisor questionaria>
RISCOS: <o que pode estar errado no seu trabalho>
FORA DE ESCOPO NOTADO: <o que viu e não tocou>
```

`CRITERIOS` fala do que você implementou, não do que testou. `INCERTO` é melhor que otimismo.
