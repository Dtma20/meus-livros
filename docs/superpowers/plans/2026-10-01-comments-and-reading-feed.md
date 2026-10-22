# Comments and reading feed implementation plan

Goal: comentários em resenhas/trechos, trechos no feed e borda fina nos campos.
Spec: ../specs/2026-10-01-comments-and-reading-feed.md
Architecture: tabela de comentários vinculada ao registro e opcionalmente ao trecho; serviço autorizado pelo registro; feed une registros e trechos; componente de conversa compartilhado.
Tech stack: Nuxt 4, Vue 3, TypeScript, Zod, Drizzle, PostgreSQL, Vitest.

## Global constraints
Sem dependências; pt-BR; texto simples; visibleLogs em todos os acessos; não alterar migrações aplicadas; preservar correções de scroll e dados existentes.

## Review focus
Isolamento entre resenha e trechos; registro/perfil privado; excluir comentário alheio; paginação com timestamps iguais; erros de envio sem perder texto.

## Tasks
- [x] Banco e comentários: shared/schemas/comment.ts, server/db/schema.ts, migração, server/services/comments.ts e rotas de comments em logs/[id]. Testes de validação, visibilidade, criação, exclusão e conversas separadas.
- [x] Feed de trechos: shared/schemas/feed.ts e server/services/feed.ts; testes de união, paginação e privacidade. Produz kind/log_id/block opcionais para preservar compatibilidade com entradas antigas.
- [x] Bordas: estilos de campos globais/específicos; borda fina indica foco e erro; preservar botões/links.
- [x] Interface: componente DiscussionThread, FeedItem, entrada/[id], ReadingBlocksSection; intervalos e âncoras; testes reais de interações e recuperação de erros.
- [x] Aplicar migração aditiva somente ao PostgreSQL local identificado; preparar banco dedicado de testes, revisar diff, lint, tipos, testes e build.

## Verification
718 unit tests and 185 integration tests passed on the dedicated test database. After the microsecond ordering fix, 19 affected UI tests and 8 comment service tests passed, including a new pagination/submission regression. Typecheck, ESLint, diff check, production build and 24 SSR/accessibility tests passed. Applied migration 0007 to local app database; existing user/work/log/block counts unchanged. Browser check confirmed public review discussion loads with no console errors and focused input has a 1px border with no visible outline or shadow. Authenticated writes and moderation verified by service and component tests.
