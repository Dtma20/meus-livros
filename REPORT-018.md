# Relatório de Implementação e Correção — TASK-018 (Home page)

## Resumo da Rodada de Correção
Revisão e resolução dos oito achados identificados na implementação inicial da TASK-018, cobrindo segurança e payload SSR, determinismo de queries no banco, semântica de datas relativas, distinção dos três estados de autenticação, propagação de erros de feed, limpeza de guardas em auto-imports do Nuxt e restauração de testes unitários com Suspense.

---

## Detalhamento dos Oito Achados Corrigidos

### 1. `app/pages/index.vue` — Usuário autenticado sem perfil
- **Problema:** Usuário recém-autenticado sem perfil cadastrado recebia landing anônima com botão de "Entrar" devido ao tratamento ingênuo de `!user`.
- **Correção:** Distinção estrita das 3 respostas de `GET /api/users/me`:
  - `401`: visitante anônimo -> landing pública com link para `/entrar`.
  - `200` com `null`: identidade verificada sem perfil em `users` -> redirecionamento imediato para `/app/bem-vindo` via `navigateTo('/app/bem-vindo')`.
  - `200` com objeto: membro com perfil -> exibição das 10 leituras recentes.

### 2. `app/utils/date.ts` — `formatRelativeDate` devolvia "há 0 anos"
- **Problema:** A checagem `diffMonths < 12` assumia meses de 30 dias (12 * 30 = 360 dias), enquanto o ramo dos anos dividia por 365. Intervalos entre 360 e 364 dias caíam em anos com `diffYears === 0`, produzindo a string literal `"há 0 anos"`.
- **Correção:** Unificação da unidade de corte em `diffDays < 365`. Intervalos de 360 a 364 dias retornam `"há 12 meses"`, e a partir de 365 dias inicia-se `"há 1 ano"`.
- **Testes:** Casos de teste adicionados em `tests/unit/feed.test.ts` para 360, 364 e 365 dias.

### 3. `app/pages/index.vue` — Erro do feed renderizado como estado vazio
- **Problema:** Falhas na rota `/api/feed/recentes` resultavam em `entries: []`, exibindo falsamente ao usuário a mensagem "Ninguém registrou nada ainda. Seja o primeiro."
- **Correção:** O estado de erro é propagado no `useAsyncData` (`hasFeedError`) e renderizado em um bloco dedicado de erro em pt-BR ("Não foi possível carregar as leituras recentes. Ocorreu um erro ao buscar as publicações. Tente recarregar a página."), distinto do `EmptyState`.

### 4. `shared/schemas/user.ts` — Tipo `UserProfile` e regras de arquitetura
- **Análise:** A interface `UserProfile` reescreve colunas de `users`. No entanto:
  - A regra de ESLint `@typescript-eslint/no-restricted-imports` proíbe terminantemente `app/**` de importar de `server/**`, inclusive imports de tipo (`allowTypeImports: false`).
  - O código compartilhado em `shared/**` é consumido pelo cliente via Vite/Rollup; importar `server/db/schema.ts` em `shared/` arrisca vazar e quebrar empacotamento de dependências de servidor (drizzle, pg, conexões).
  - Conforme convenção documentada em `shared/schemas/log.ts`, os contratos de resposta consumidos por páginas cliente residem em `shared/` para garantir isolamento cliente/servidor.
  - Como a home page agora só consome o status de autenticação e não precisa do objeto `UserProfile` no payload SSR, o tipo não é importado em `index.vue`.

### 5. `server/services/feed.ts` — Subconsulta de capa determinística
- **Problema:** `SELECT e.cover_url FROM editions e WHERE e.work_id = works.id AND e.cover_url IS NOT NULL LIMIT 1` não tinha `ORDER BY`, gerando resultados indeterminísticos para obras com múltiplas edições com capa.
- **Correção:** Adicionada ordenação determinística: `ORDER BY e.created_at, e.id LIMIT 1`.

### 6. `server/services/feed.ts` + `app/pages/index.vue` — Vazamento de resenha completa e e-mail no SSR
- **Problema:** O feed serializava a resenha na íntegra além de `review_excerpt`, e o `UserProfile` completo (incluindo `email` e `bio`) era mantido no payload do `useAsyncData`.
- **Correção:**
  - Campo `review` removido de `FeedEntry` no serviço `server/services/feed.ts` e de `feedEntrySchema` em `shared/schemas/feed.ts` (mantido apenas `review_excerpt`).
  - Objeto `user` removido do payload retornado por `useAsyncData` em `index.vue` (armazenando apenas `authenticated`, `entries`, `hasFeedError` e `redirectTo`).

### 7. `app/pages/index.vue` — Eliminação de requisições SSR sequenciais
- **Problema:** `/api/users/me` e `/api/feed/recentes` eram executadas em cascata sequencial antes de emitir o primeiro byte da home.
- **Correção:** Execução paralela com `Promise.allSettled([requestFetch('/api/users/me'), requestFetch('/api/feed/recentes')])`, reduzindo a latência do SSR e preservando a integridade dos três estados de autenticação.

### 8. `app/pages/index.vue` e `tests/unit/routes.test.ts` — Limpeza de guardas de auto-imports
- **Problema:** Guardas `typeof X === 'function'` em `setPageLayout`, `useRequestURL`, `useSeoMeta` e `useHead` escondiam possíveis falhas reais de auto-import.
- **Correção:**
  - Stub `globalScope.setPageLayout = () => {}` adicionado ao `vi.hoisted` em `tests/unit/routes.test.ts`.
  - Todas as 4 guardas `typeof X === 'function'` removidas de `app/pages/index.vue`.

### Item adicional — Restauração de asserção na home (`tests/unit/routes.test.ts`)
- **Problema:** O teste `renders index and login pages` havia trocado a asserção sobre a home por um comentário.
- **Correção:** O helper `mount` foi envolvido em `<Suspense>` nativo do Vue (`import { Suspense } from 'vue'`), com função `flushAsync()` aguardando a resolução do setup assíncrono. A asserção `expect(wIndex.text()).toContain('Início')` foi restaurada com sucesso.

---

## Arquivos Alterados no Commit
- `~ app/pages/index.vue`
- `~ app/utils/date.ts`
- `~ server/services/feed.ts`
- `~ shared/schemas/feed.ts`
- `~ tests/unit/feed.test.ts`
- `~ tests/unit/routes.test.ts`
