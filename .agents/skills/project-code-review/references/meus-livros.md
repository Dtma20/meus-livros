# Referência de review: Meus Livros

Todos os caminhos abaixo são relativos à raiz do repositório. Esta referência seleciona fontes e riscos; os documentos e o código vigentes continuam sendo a autoridade. Não transporte políticas do Marelli Audit para cá.

## Fontes por escopo

Em todo review, leia `CLAUDE.md`, `docs/README.md` e a tarefa correspondente de `docs/tasks/`, quando houver, incluindo exclusões e critérios de aceite. Leia `docs/agent-workflow.md` §4 para o protocolo do reviewer; relatos datados e regras de agentes implementadores não são resultados de verificação deste review.

| Mudança | Fontes a ler integralmente |
|---|---|
| Arquitetura, limites de camadas ou dependências | `docs/architecture.md`; `docs/architecture-review.md` quando mudar decisão deliberada. |
| Rotas, services, autenticação, autorização ou entrada de usuário | `docs/api.md` e `docs/security.md`. |
| Páginas, componentes, composables, estilos ou SSR | `docs/frontend.md`; também `docs/security.md` quando tocar sessão, privacidade ou entrada de usuário. |
| Schema, consultas, integridade ou migrations | `docs/database.md`; `docs/api.md` e `docs/security.md` para acesso a dados de leitores. |
| Importação, ISBN, datas ou ordenação do legado | `docs/migration.md` e `docs/database.md`. |
| Busca, catálogo ou capas | `docs/book-catalog.md`; confira a implementação atual antes de assumir integração externa. |
| Testes ou comandos de verificação | `tests/README.md`, `package.json`, `vitest.config.ts` e setup do projeto de teste selecionado. |
| Deploy, backups ou configuração de ambiente | `docs/infrastructure.md`. |

Há descrições históricas nos docs que podem divergir de caminhos e comportamento atuais. Localize o símbolo no código, confira a tarefa e registre conflitos materiais. Por exemplo, o helper de visibilidade está em `server/services/visibility.ts`; sua localização antiga em um exemplo de documentação não é uma infração no diff.

## Lentes locais

Selecione as lentes que o diff pode afetar, seguindo o fluxo completo até os consumidores.

- **Privacidade:** leituras de `reading_logs` usam `visibleLogs(viewer)`, com viewer obrigatório. Confira joins de `users`, logs públicos em perfil privado, paginação, contagens, estatísticas, feed, exportação e metadados SSR/OG. Teste dono, outro usuário e anônimo. Não basta filtrar a lista se um agregado revela os registros ocultos. Ownership de mutações fica na query; recurso privado responde 404.
- **Camadas e contratos:** rotas finas validam, autorizam e delegam a services; contrato compartilhado em `shared/`, sem imports de `server/` em `app/`. Confira `eslint.config.mjs` para os limites efetivamente aplicados, incluindo exceções de schema/scripts. Zod no cliente não elimina revalidação no servidor. Preserve `Response`, status e todos os cookies nos wrappers de auth.
- **Auth e segurança:** acompanhe allowlist em produtores e consumidores de OTP, rotas de auth negadas por padrão, rate limits por identificador/IP, remoção de acesso e revogação de sessões. Distinga `users.id` de `ba_user.id`. Leia a configuração do cookie cache antes de exigir invalidação imediata por replay de cookie. Nunca exponha tokens, OTP, senhas ou detalhes de banco em respostas/logs. Confira Origin, redirecionamentos, `cover_url` HTTPS e proibição de `v-html`.
- **Frontend e assincronia:** diferencie 404 de falha recuperável; confira loading/error/empty, retry e status SSR. Fontes independentes falham independentemente. Rascunhos sobrevivem a falha, ficam separados por usuário/contexto e só são apagados após save confirmado ou sign-out. Ao limpar campo em edição, confira a diferença entre `null` e `undefined`. Verifique duplo submit, respostas fora de ordem, mudança de entidade e desmontagem. Se tocar exclusão adiada, examine Desfazer, countdown, `pagehide`, retorno via bfcache e recuperação de falha segundo `docs/frontend.md`.
- **SSR e acessibilidade:** páginas públicas e OG preservam conteúdo e privacidade antes da hidratação; imports/client globals respeitam o limite server/client. Confira conteúdo sem JS, teclado, foco de modal, Escape, controles semânticos e overflow em telas pequenas. Axe em Happy DOM não comprova contraste renderizado, layout ou hidratação.
- **Dados e legado:** re-leituras são registros distintos; não exigir `UNIQUE(user_id, work_id)`. Edição pode ser nula; ISBN tem índice único parcial; anos podem ser negativos; número de série é texto; datas podem ter precisão de ano. Defaults de leitura usam a data local do navegador. Confira compatibilidade de migrations com a versão anterior e não reescreva migration aplicada.
- **Escopo:** compare literalmente com a tarefa. Preserve decisões deliberadas: autorização no servidor sem RLS, um projeto/deploy e infraestrutura simples. Complexidade, dependência ou cache exigem motivo concreto. Não transforme review em refactor de todo o projeto.

Se o pedido for auditar confiabilidade da suíte, flakiness, mocks ou cobertura, use também a skill local `test-suite-auditor`. Para review específico de UX/Vue/Nuxt, use `vue-nuxt-ux-review` quando disponível. Essas especializações não substituem a investigação do diff.

## Verificação atual

Confira os comandos e pré-requisitos no checkout revisado; números de relatórios antigos não são resultados atuais.

| Check | O que demonstra / pré-requisito |
|---|---|
| `npm run lint` e `npm run typecheck` | Gates locais de lint e tipos. |
| `npm run test:unit` | `unit-node` + `unit-dom`, sem banco ou build. |
| `npm run test:integration` | `integration-node` + `integration-dom`; PostgreSQL dedicado a testes, migrado e com gêneros semeados. |
| `npm test` | Unitários + integração funcional; **não inclui SSR** na configuração atual. |
| `npm run build`, depois `npm run test:ssr` | `ssr-node` + `ssr-dom`; banco de teste e bundle atual. O setup recusa bundle ausente/antigo e não faz build nos workers. |
| `npm run test:full` / `npm run test:all` | Todos os projetos; `test:all` faz build antes. |
| `npm run test:perf` | Benchmark separado; rode quando desempenho estiver em escopo. |

Para entrega de código, o reviewer verifica lint, tipos, testes e critérios de aceite; mudanças de frontend/SSR exigem build e checks SSR pertinentes. Se o critério menciona HTTP real, um unitário de handler não o satisfaz. Use checks focados para investigar; gates de conclusão seguem a tarefa e o protocolo local. Alterações somente em documentação/skills pedem validação do artefato, sem obrigar uma suíte com banco.

Integração pode mutar e expurgar dados: confirme que a conexão aponta para PostgreSQL dedicado a testes, inclusive quando Vitest carrega `.env`. Não rode migrations ou cleanup na base ativa para reproduzir um achado. Não copie `.env` para worktrees. Fixtures precisam de identificadores exclusivos e cleanup restrito aos próprios registros. Declare checks indisponíveis; não os converta em sucesso.

## Idioma, severidade e saída

Commit messages seguem Conventional Commits em inglês; UI é pt-BR. Reviews neste chat seguem o idioma do usuário. Não há catálogo FE/BE nem padrão Marelli de título/body/comentários a exigir: cite `CLAUDE.md` ou documento/seção local e use a taxonomia do núcleo quando nenhum formato específico for pedido.

Tarefa em `docs/tasks/` é a fonte de aceite; Jira não é pré-requisito. Escopo local é uma tarefa por commit ou PR. Registre excessos ou critérios faltantes com seu impacto; não invente teto de linhas ou matriz de aprovação. Um parecer de ausência de achados não autoriza merge nem atesta gates de lançamento, backup ou deploy fora do escopo.
