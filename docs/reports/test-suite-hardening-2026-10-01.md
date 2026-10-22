# Correção e validação independente da suíte — 2026-10-01

Base Git: `5e85ec5`, acrescida das alterações locais de hardening já existentes e das correções desta revisão. Este relatório descreve o estado do workspace; não representa um novo commit.

## Resultado

A suíte passou com **99 arquivos e 891 testes, sem falhas nem skips**, em três execuções completas com ordem embaralhada. Também passaram build, lint, tipagem, verificações temporais em dois fusos e benchmark. As verificações de banco foram feitas em PostgreSQL 18.4 local, dedicado à auditoria, sem aplicar migrations à base ativa da aplicação. Nenhum arquivo de `app/`, `server/`, `shared/` ou do importador de produção foi alterado por esta correção.

O relatório anterior de 5/5 em todas as dimensões não era sustentado pelo código: havia dependência de banco durante a coleta de unitários, problemas de lint, testes superficiais de migrations/importação, contrato permissivo de edições e resíduos de rate limit. Uma execução verde confirmava apenas os cenários então presentes.

## Métricas verificadas

| Execução | Arquivos | Testes aprovados | Falhas / skips | Tempo |
| --- | ---: | ---: | ---: | ---: |
| Unitários sem URLs de banco e sem carregamento de `.env` | 73 | 694 | 0 / 0 | 12,69 s |
| Integração funcional no fluxo `test:all` | 24 | 173 | 0 / 0 | 10,60 s |
| SSR e axe no fluxo `test:all` | 2 | 24 | 0 / 0 | 4,53 s |
| Suíte completa, seed `20261001` | 99 | 891 | 0 / 0 | 25,96 s |
| Suíte completa, seed `20261002` | 99 | 891 | 0 / 0 | 25,85 s |
| Suíte completa, seed `20261003` | 99 | 891 | 0 / 0 | 28,20 s |
| Datas e importador em UTC | 5 | 55 | 0 / 0 | 2,27 s |
| Datas e importador em America/Fortaleza | 5 | 55 | 0 / 0 | 2,42 s |

Os tempos da tabela são os reportados pelo Vitest. `npm run test:all`, incluindo build e três invocações sequenciais do Vitest, terminou com código 0 em **101,00 s de tempo de parede**. Nesse fluxo, os unitários levaram 15,17 s. O total de 891 é a soma dos três grupos; as repetições e os 55 casos temporais não são testes adicionais ao inventário.

`npm run lint`, `npm run typecheck` e `git diff --check` terminaram com código 0. Integração com ambas as URLs removidas e `DOTENV_CONFIG_PATH` apontando para um arquivo inexistente terminou com código **1**, por falta de `DATABASE_URL`, antes de executar os casos. Isso é o resultado esperado desse teste de proteção.

### Custo por arquivo

As durações de todos os 99 arquivos estão em [test-suite-hardening-2026-10-01.csv](test-suite-hardening-2026-10-01.csv), extraídas do console da terceira rodada. Os maiores custos foram:

| Arquivo | Testes | Duração |
| --- | ---: | ---: |
| `tests/integration/axe.test.ts` | 8 | 6.393 ms |
| `tests/integration/auth.test.ts` | 23 | 3.924 ms |
| `tests/integration/migrate-livros.test.ts` | 1 | 2.486 ms |
| `tests/integration/routes.test.ts` | 16 | 2.090 ms |
| `tests/integration/catalog.test.ts` | 20 | 1.663 ms |

A soma das durações por arquivo é 38.416 ms, pois há execução concorrente; ela não equivale ao tempo de parede. Transformação, importação e inicialização dos ambientes também consomem tempo. Não foi medida memória ou CPU por processo.

### Benchmark

`npm run test:perf` terminou com código 0, sem dados de benchmark remanescentes. Com 1.500 obras e 20 amostras por operação, mediu baseline p95 de **0,33 ms**, busca p95 de **11,32 ms** e diferença de **10,99 ms**, abaixo da meta estrita de 150 ms. Essa diferença entre dois percentis não é um “p95 líquido”. Os números descrevem este PostgreSQL local e não devem ser extrapolados para uma base remota.

## Correções entregues

### 1. Testes reais de migrations e importação

- `tests/integration/disposable-database.ts` cria um banco exclusivo por arquivo, com nome aleatório, e o remove no teardown. Falta de permissão para criação é um erro explícito; `TEST_DATABASE_ADMIN_URL` permite uma conexão administrativa separada ao PostgreSQL de teste.
- `tests/integration/migrations.test.ts:9` aplica a cadeia completa `0000` a `0006` em banco vazio usando o migrador real. Verifica tabelas, extensões, journal, índice composto do feed, constraints de auditoria, seed e coluna de busca gerada. Uma segunda execução do migrador preserva journal e dados. Isso comprova a idempotência do **migrador**, não a execução isolada de cada DDL duas vezes.
- `tests/integration/migrate-livros.test.ts:32` executa o CLI real em banco e diretório temporários. Confere 86 obras, 86 edições, 86 logs, 60 autores, ISBNs/ASINs, anos negativos, séries textuais, precisão anual, timestamps UTC e ordem persistida. Também verifica sanitização dos reviews e arquivos gerados.
- O teste unitário que fabricava timestamps localmente foi removido: agora o comportamento temporal é observado no banco após rodar o importador.

### 2. Feedback unitário e limpeza verificável

- Os helpers puros de importação/transferência e escape de busca usam um mock mínimo de `server/db`, sem URL fictícia e sem métodos de consulta. A coleta unitária funciona sem banco; uso acidental de uma consulta continua falhando. Referências: `tests/unit/migrate-livros.test.ts:15`, `tests/unit/library-transfer.test.ts:15`, `tests/unit/search-escape.test.ts:4`.
- `vitest.config.ts:12` descobre testes DOM pela diretiva do arquivo, eliminando a lista manual de nomes. `vitest.config.ts:20` restringe o limite de quatro workers ao Windows.
- `tests/integration-setup.ts:2` rejeita URL ausente ou contendo somente espaços. O setup SSR apenas verifica o bundle; `test:all` faz build antes de executar os seis projetos.
- Auth inventaria as combinações reais de identificador/IP, limpa os hashes e confere a ausência dos buckets. Um registro de controle alheio deve sobreviver à limpeza: `tests/integration/auth.test.ts:84`, `tests/integration/auth.test.ts:240`.
- Foi reproduzido um vazamento adicional em convites: o login de um membro revogado deixava dois buckets novos e reutilizava o bucket de IP padrão. O caso agora usa IP próprio, registra as três chaves e confere o teardown: `tests/integration/invites.test.ts:130`.
- ISBNs usam aleatoriedade criptográfica; IPs evitam repetição dentro do worker e reduzem colisões entre workers. Isso não é garantia matemática de unicidade entre processos distintos.

### 3. Contratos, cache e processos

- `tests/integration/routes.test.ts:106` exige o JSON completo de uma edição real e inclui uma edição de outra obra como controle. Um array vazio ou uma consulta sem filtro de obra não satisfaz mais o teste.
- `tests/unit/feed-cache.test.ts:34` verifica a expiração exatamente na fronteira de 30 s, com payload novo e restauração dos timers reais. `tests/integration/feed.test.ts:174` exerce mutações reais de visibilidade do log e do perfil após aquecer o cache, verificando a saída pública e a visão do proprietário.
- Os testes de origem/CSRF cobrem POST, PUT, PATCH e DELETE, incluindo ausência de Origin e rejeição de origem externa com código de erro estrito. As asserções SQLSTATE de `tests/integration/db.test.ts` verificam códigos concretos, sem `catch` permissivo.
- `tests/integration/server-process.ts:18` espera uma linha de porta completa, inclusive quando o anúncio chega em chunks. Há testes reais de processo para saída precoce e timeout; SSR aguarda o encerramento dos servidores.
- Axe mantém verificação semântica de HTML SSR, restaura suas configurações e evita carregar recursos externos. Seu limite é explícito em `tests/integration/axe.test.ts:202`: contraste renderizado não é validado nesse ambiente.
- `scripts/search-benchmark-metrics.ts:2` rejeita amostras inválidas e reprova diferença de p95 maior ou igual a 150 ms. O CLI propaga a falha com código 1 e limpa as fixtures em `finally`.

## Evidências de regressão e resíduos

O teste do orçamento do benchmark foi observado falhando antes da inclusão do gate e passando depois. A asserção de cleanup de convites também falhou no teardown antes da limpeza direcionada, embora os nove casos do arquivo estivessem verdes; após a correção, passou inclusive com shuffle. As saídas foram registradas em `benchmark-red.log`, `metrics-import-green.log`, `invites-cleanup-red.log` e `invites-cleanup-green.log` no diretório local de evidências da auditoria.

Antes das três rodadas finais, o banco auxiliar continha 72 buckets remanescentes das execuções investigativas anteriores. O conjunto completo de chaves foi idêntico após cada rodada e após `test:all` e benchmark. Portanto, a evidência é **zero novos buckets**, não uma tabela globalmente vazia. O controle dentro do teste de auth prova preservação de um registro alheio à fixture.

No fechamento, as 14 tabelas públicas de dados/fixtures estavam vazias; somente `genres` (26 linhas de seed) e `rate_limit` (os mesmos 72 buckets prévios) continham linhas. Não restaram bancos `meus_livros_test_*`. Nenhuma limpeza global de buckets foi usada para esconder resíduos entre as rodadas finais.

## Scorecard técnico após a correção

As notas abaixo são uma avaliação qualitativa, não percentuais de cobertura nem uma certificação de ausência de regressões.

| Dimensão | Nota | Evidência e limite principal |
| --- | ---: | --- |
| Arquitetura, configuração e desempenho | 4/5 | Unitários independentes, seis projetos e build explícito; SSR continua tendo custo relevante |
| Caminhos críticos e negócio | 4/5 | Migração/importação reais e cache de privacidade protegidos; não foi demonstrada cobertura exaustiva de todas as rotas e jornadas |
| Asserções e eficácia | 4/5 | Contrato JSON estrito, SQLSTATE e estado persistido; outras asserções permissivas ainda existem na suíte |
| Mocks e isolamento | 4/5 | SQL real em cenários críticos e cleanup comprovado; mocks de queries/framework nos unitários continuam tendo limites |
| Confiabilidade e resiliência | 4/5 | Três seeds, dois fusos e encerramento de processos verificados; virada da janela horária do rate limit e navegador real não foram exercitados |
| **Média** | **4,0/5** | **Melhoria comprovada; 5/5 universal não está justificado** |

As três prioridades da revisão foram atendidas: testar os executáveis reais de migração/importação, tornar feedback e cleanup verificáveis e fortalecer contratos/cache/benchmark. Os próximos incrementos de cobertura devem ser escolhidos por risco: jornadas em navegador real, fronteiras horárias do rate limit e mutações HTTP ainda protegidas principalmente por testes de serviço. Não foi adicionada uma pipeline de testes ao GitHub Actions.

Para executar e manter a suíte, consulte [tests/README.md](../../tests/README.md). A migration `0006` foi exercitada nos bancos temporários; a aplicação à base ativa continua sendo uma operação separada.
