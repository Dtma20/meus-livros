# Executando a suíte

Use Node compatível com o projeto e instale as dependências com `npm ci`.

| Comando | Escopo | Pré-requisitos |
| --- | --- | --- |
| `npm run test:unit` | `unit-node` e `unit-dom` | Não precisa de banco nem de build |
| `npm run test:integration` | `integration-node` e `integration-dom` | PostgreSQL de teste migrado e gêneros semeados |
| `npm test` | Unitários e integração funcional | Mesmo banco de teste |
| `npm run test:ssr` | `ssr-node` e `ssr-dom` | Banco de teste e bundle atualizado por `npm run build` |
| `npm run test:full` | As seis configurações de teste | Banco e bundle atualizado |
| `npm run test:all` | Build seguido de `test:full` | Banco de teste; inclui o custo do build |
| `npm run test:perf` | Benchmark separado, com 1.500 obras temporárias | Banco de teste preparado |

## Banco

Configure `DATABASE_URL` e `DATABASE_URL_DIRECT` para um **PostgreSQL dedicado a testes**. Não use a base ativa da aplicação: os testes exercitam mutações e a rotina real de expurgo de rate limits. `vitest.config.ts` carrega `.env`, portanto uma variável ausente no shell ainda pode vir desse arquivo.

Prepare somente esse banco:

```sh
npm run db:migrate
npm run db:seed
npm run test:integration
```

Integração sem `DATABASE_URL` termina com código 1 no setup global. A preparação do esquema não ocorre implicitamente no setup da suíte.

Os testes de migrations e de importação criam bancos vazios próprios, executam o migrador real e os removem no teardown. A conexão deve poder executar `CREATE DATABASE`, instalar `citext`, `unaccent` e `pg_trgm` e remover o banco criado. Caso o usuário de `DATABASE_URL` não tenha essa permissão, configure `TEST_DATABASE_ADMIN_URL` com uma conexão administrativa ao PostgreSQL **de teste**. Falta de permissão causa erro explícito, sem skip.

O importador roda com o dataset legado em um diretório temporário. Sua saída SQL e os arquivos gerados são verificados sem reescrever `legacy/` do repositório.

## Ambientes e isolamento

O primeiro comentário `// @vitest-environment happy-dom` em um teste unitário determina sua inclusão em `unit-dom`; os demais vão para `unit-node`. A configuração descobre esses arquivos recursivamente, sem uma lista manual de nomes. O projeto DOM de integração contém o cenário de estados vazios/erros. Os dois projetos SSR executam contratos HTTP e axe no HTML do servidor compilado.

O limite de quatro workers é aplicado no Windows. Outros sistemas usam o padrão do Vitest. Fixtures devem usar marcadores exclusivos e apagar apenas seus próprios registros; buckets de rate limit são identificados pelo hash SHA-256 da chave real. Não substitua o cleanup por um `DELETE` global.

`tests/global-setup.ts` verifica a presença e a idade do bundle SSR; ele não faz build dentro dos workers. O servidor anuncia uma linha `PORT:<número>` completa e seu encerramento é aguardado no teardown.

## Verificação de ordem e datas

```sh
npx vitest run --sequence.shuffle --sequence.seed=20261001
```

Para reproduzir um resultado, mantenha o mesmo seed. Execute também testes intermediários isolados com `-t` quando modificar fluxos de autenticação.

As verificações temporais devem ser executadas com `TZ=UTC` e `TZ=America/Fortaleza`, incluindo `tests/integration/migrate-livros.test.ts`, que confere timestamps persistidos pelo importador real. No PowerShell use `$env:TZ = 'UTC'` antes do comando e remova a variável ao terminar.

## Limites das verificações

O axe em Happy DOM valida semântica do HTML SSR, incluindo páginas autenticadas. CSS/JS externos são desativados nesse cenário e a regra `color-contrast` não roda. Contraste renderizado, foco, navegação por teclado e hidratação ainda exigem testes em navegador real.

O benchmark mede 20 amostras de `SELECT 1` e de busca, informa ambos os p95 e sua diferença. Essa diferença **não é o p95 de amostras líquidas**. Um valor maior ou igual a 150 ms causa código de saída 1; falhas e sucesso passam pelo cleanup. O benchmark fica fora dos testes funcionais para não misturar desempenho e integridade.

Para uma pipeline, rode unitários primeiro, prepare o PostgreSQL dedicado, execute integração, faça build e execute SSR. Benchmark deve ser uma etapa separada e com ambiente estável. Uma execução verde não demonstra cobertura universal nem ausência de flakiness em todas as máquinas.
