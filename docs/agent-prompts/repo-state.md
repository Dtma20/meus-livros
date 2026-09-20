## Estado real do repositório

> Mantenha este arquivo atualizado a cada merge. Ele entra no prompt de todo agente e é o que impede que reinventem o que já existe.

Concluídas e em `develop`: 001 scaffold, 002 conexão Neon, 003 schema, 004 migração + seed, 005 tokens e componentes, 006 layouts e rotas, 007 autenticação por código de e-mail, 009 serviços de catálogo, 010 busca local, 019 migração dos 86 livros.

### Banco

Migrado, semeado e **populado**. 10 tabelas da aplicação, migrações `0000` e `0001` aplicadas, função `f_unaccent`, coluna gerada `works.search_text`, índice `works_search_idx` com `text_pattern_ops`.

Migração `0002` aplicada também: `ba_user`, `session`, `account`, `verification` e `rate_limit`, as quatro primeiras do better-auth. O DDL foi conferido campo a campo contra o `getAuthTables()` do próprio better-auth.

Conteúdo atual: 26 gêneros, 86 obras, 60 autores, 86 edições, 86 registros de leitura, 1 usuário. Três edições têm `isbn13` nulo — são ASINs da Amazon no acervo original (`B07PV188F2`, `B09LZ3RVZD`, `B015EE5N7G`), e o índice único parcial existe justamente para isso. O acervo tem 64 ISBN-13 e 19 ISBN-10; o "22 ISBN-10" que circulava nos documentos de planejamento estava errado e já foi corrigido.

**A suíte de testes roda contra este banco.** Todo teste de integração usa `describe.skipIf(!process.env.DATABASE_URL)` e **limpa todas as linhas que criar**.

### Convenções já estabelecidas — siga, não redecida

- `server/db/schema.ts` é a fonte da verdade. **Não altere o schema** sem que a task peça. Achou erro, relate.
- Tipos inferidos em `server/db/types.ts` (`User`, `Work`, `NewWork`, ...). Nunca duplique tipo à mão.
- **Só `server/services/**` pode importar o handle `db`.** ESLint barra em `app/` e `server/api/`. `scripts/**` é isento.
- Sessão tem **um único ponto de costura**: `server/utils/session.ts`, com `getSessionUser(event)` e `requireSessionUser(event)`. Use-o. Não leia cookie direto em rota. O `id` que sai dali é o **uuid de `users.id`**, nunca o id do better-auth. **Sem linha em `users`, devolve `null`** — identidade verificada sem perfil lê como anônimo, e é a TASK-008 que cria o perfil.
- Auth: `server/services/auth.ts`. `/api/auth/**` **nega por padrão** — só `send-verification-otp`, `sign-in/email-otp`, `get-session` e `sign-out` passam; todo o resto responde 404. Ao mexer nisso, lembre que o plugin de OTP registra quatro rotas que disparam e-mail. Rate limit em `server/services/rate-limit.ts`, contador por hora no Postgres.
- Formato de erro sai por `server/utils/api.ts`: `defineApiHandler(fn)` e `parseOrThrow(schema, valor)`. Rotas novas usam os dois — eles produzem `{ error, message }` e impedem stack trace de vazar.
- Zod compartilhado em `shared/schemas/`. Uma definição, usada por formulário e rota.
- Catálogo: `server/services/catalog.ts` tem `createWork`, `createEdition`, `findOrCreateAuthor`, `findDuplicateWork`. `createWork` aceita `{ force, skipRateLimit, tx }` — `skipRateLimit` existe só para scripts de migração, **nunca a partir de rota HTTP**.
- Busca: `server/services/search.ts`. `%` e `_` do usuário são escapados e a consulta usa `ESCAPE '\'`. Não reintroduza `ILIKE` cru.
- Componentes prontos em `app/components/`: `BookCover`, `BookCard`, `BookGrid`, `StarRating`, `ReviewText`, `EmptyState`. Props camelCase, **um nome por prop**. Não recrie, não adicione variantes.
- Tokens CSS em `app/assets/css/tokens.css`. Use as variáveis, nada de valor mágico.
- Migrações: geradas com `drizzle-kit`, **commitadas**, aplicadas à mão pelo mantenedor contra `DATABASE_URL_DIRECT`. Nunca edite migração já aplicada; adicione nova. Migração ainda não aplicada pode ser editada.
- Rodar script one-off: `npx tsx arquivo.ts`. `tsx` é devDependency. `npm run db:seed` semeia gêneros. `scripts/migrate-livros.ts` já importou os 86 livros e **se recusa a rodar de novo** sem `--force`.
- Teste: `environment: 'node'` é o padrão. Teste que precisa de DOM declara `// @vitest-environment happy-dom` no topo do arquivo. **Não mexa no padrão global** — `happy-dom` global custou 47s de setup e foi revertido.
- Datas default vêm da **data local do navegador**. O servidor é UTC e a coorte é UTC−3.
