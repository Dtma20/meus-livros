# Livrolas

Plataforma de leitura em português para registrar livros, organizar a estante, escrever resenhas e compartilhar leituras com um grupo de amigos.

A aplicação principal usa **Nuxt 4, Vue 3 e TypeScript**, com renderização no servidor, PostgreSQL e Drizzle. A entrada é restrita a e-mails convidados, com autenticação pelo Better Auth. Os arquivos do portfólio anterior à migração ficam em [`legacy/`](legacy/).

## Recursos

- Catálogo de obras, autores, gêneros e edições, com busca e cadastro manual.
- Diário, estante, releituras, avaliações, resenhas e acompanhamento de leitura.
- Perfis e registros com visibilidade pública ou privada.
- Atividade entre leitores, comentários e administração de convites.
- Estatísticas gerais e retrospectivas anuais, incluindo páginas, autores, países, idiomas, formatos, editoras e épocas de publicação.
- Interface responsiva com identidade visual de papel sobre grafite e detalhes de origami.

## Desenvolvimento local

Requer Node.js 24, pnpm 11.10.0 e PostgreSQL. O Docker Compose incluído oferece um banco local.

```sh
pnpm install
cp .env.example .env
docker compose up -d
```

Preencha o `.env` com os valores do ambiente local. Configure `DATABASE_URL` e `DATABASE_URL_DIRECT` no ambiente do processo antes de migrar; o Drizzle usa a conexão direta. Em seguida:

```sh
pnpm db:migrate
pnpm db:seed
pnpm dev
```

O guia de [infraestrutura](docs/infrastructure.md) detalha configuração de banco, autenticação, SMTP, convites e publicação. Não use credenciais de produção em desenvolvimento ou testes.

## Verificação

```sh
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build
```

Os testes de integração e SSR precisam de um PostgreSQL exclusivo para testes, migrado e com gêneros semeados. O SSR também exige um build atualizado. Consulte [`tests/README.md`](tests/README.md) antes de executar essas suítes.

## Documentação

- [Visão geral técnica e decisões](docs/README.md)
- [Arquitetura](docs/architecture.md)
- [Configuração e deploy](docs/infrastructure.md)
- [Segurança e privacidade](docs/security.md)
- [Migração do portfólio](docs/migration.md)
- [Estado das tarefas e pendências](docs/agent-workflow.md)

A implantação de uma nova instância exige configurar seu próprio banco, autenticação, SMTP e e-mails permitidos. Os arquivos `.env` reais e as credenciais não fazem parte do repositório.
