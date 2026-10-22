---
name: test-suite-auditor
description: >-
  Metodologia investigativa avançada para auditoria, debug e code-review de suítes de testes,
  arquitetura de QA e contratos de backend (Vitest/Jest, Vue/Nuxt, Node.js, SQL/ORM).
  Use sempre que for solicitado a auditar, debugar, avaliar a cobertura, investigar flakiness
  ou revisar a confiabilidade de testes e mutações em qualquer projeto.
---

# Test Suite & Backend QA Auditor: Framework das 3 Lentes

Este guia estabelece a heurística de auditoria avançada sintetizada a partir da triangulação
de métodos de inspeção profunda de suítes de teste (Antigravity, Claude e GPT).

---

## 1. As 3 Lentes Investigativas

### Lente 1: Perturbação de Estado, Ordem e Concorrência (Abordagem Comportamental)
Nunca confie em uma suíte que passa apenas em ordem linear padrão com todas as fixtures prontas.

1. **Teste do Caso Isolado:**
   - Execute um teste intermediário de um arquivo longo de forma completamente isolada:
     `npx vitest run path/to/file.test.ts -t "nome do teste"`
   - *O que buscar:* Falha por depender de login, token, senha ou registro criado por um teste anterior no mesmo arquivo.
2. **Teste de Embaralhamento (Shuffle Execution):**
   - Execute a suíte ou o arquivo com ordem randômica forçada:
     `npx vitest run --sequence.shuffle --sequence.seed=123456`
   - *O que buscar:* Vazamento de variáveis globais (`globalThis`, `window`), mocks de navegação (`navigateTo`, `history.pushState`) não reinstalados no `beforeEach`, e singletons de composables/stores que retêm estado.
3. **Colisão de Entropia em Paralelismo:**
   - Procure por valores únicos constantes ou de baixa dispersão usados em testes concorrentes:
     - UUIDs estáticos: `'00000000-0000-0000-0000-000000000001'`
     - Identificadores fixos: CPF, CNPJ, ISBN, e-mails ou handles sem timestamp/nanoid.
     - IPs gerados com baixa entropia (ex: `Date.now() % 200`), que colidem buckets de rate limit se executados no mesmo milissegundo.

---

### Lente 2: Falsos Positivos, Borda Silenciosa & Limpeza Fantasma (Abordagem de Resiliência)
Identifique onde a suíte mente para o desenvolvedor ou deixa resíduos invisíveis.

1. **O Teste do Ambiente Desplugado (Silent Skips):**
   - Inspecione se há estruturas como `describe.skipIf(!hasEnvVar)`:
     - O que acontece se a variável de banco (`DATABASE_URL`, `REDIS_URL`) sumir?
     - A suíte sai com código de saída 0 (verde falso) sem rodar nenhuma integração?
   - *Regra:* Testes de integração devem **falhar alto** quando a infraestrutura necessária estiver ausente, a menos que o projeto seja explicitamente unitário.
2. **Auditoria de Limpeza Morta (Phantom Cleanups):**
   - Inspecione as queries de `afterEach` e `afterAll`:
     - Se o teste salva uma chave como hash SHA-256 no banco (ex: `rate_limit`), a cláusula `DELETE WHERE key LIKE %email%` nunca casará.
     - O banco de desenvolvimento/CI incha silenciosamente a cada execução.
3. **Armadilhas de Tempo e Calendário (Temporal Boundaries):**
   - Funções de banco baseadas em `date_trunc('hour', now())` não são afetadas por `fakeTimers` do Node.
   - Testes de taxa limite executados às `hh:59:58` veem o contador zerar no meio da asserção.
   - Sempre verifique se datas foram testadas com `TZ=UTC` e no fuso local para evitar bugs na virada da meia-noite UTC.
4. **Inventário de Rotas vs. Testes (The Dark Zone):**
   - Liste todos os arquivos de endpoints (`server/api/**/*.ts`) e cruze com os arquivos de teste.
   - Rotas mutantes (POST/PUT/PATCH/DELETE) que não passam por HTTP direto arriscam perder middlewares de autenticação, parsers de body e validações de cabeçalho.
   - Middlewares de segurança (CORS, CSRF, verificação de `Origin`) são pontos cegos frequentes.

---

### Lente 3: Mocks, Contratos e Ilusões de Segurança (Abordagem de Integridade)
Evite que a suíte teste o próprio mock ou aceite respostas de erro como sucesso.

1. **Detecção de "Framework Falso" em `globalThis` (Over-mocking):**
   - Verifique se os testes estão fazendo monkey-patching manual de dezenas de utilitários do framework (ex: Nuxt, Next, SvelteKit) em vez de usar os test-utils oficiais:
     - Exemplo: `globalScope.useAsyncData = () => ({ data: ... })` ignorando o callback real.
   - *O perigo:* O teste valida apenas a simulação inventada pelo autor do teste, mascarando quebras reais do framework.
2. **Asserções Covardes (Permissive / Tautological Asserts):**
   - `expect(res).toBeDefined()` ou `expect(typeof res).toBe('object')` (aceita qualquer coisa que não seja `undefined`).
   - `expect(body).not.toContain('404')` (aceita HTTP 500, crash de banco ou página vazia).
   - `expect(mockDelete).toHaveBeenCalledTimes(1)` sem validar a cláusula `.where()` (um bug que remova o WHERE e apague o banco inteiro passa nesse teste!).
   - `expect(1 + 1).toBe(2)` (teste tautológico puro).
3. **A Ilusão da Acessibilidade Automatizada:**
   - Checar se ferramentas como `axe-core` estão rodando em navegadores virtuais (Happy-DOM / JSDOM) com regras de contraste desativadas (`color-contrast: false`).
   - Sem renderização real de layout e CSS, o teste não afere acessibilidade visual real.
4. **O Anti-Padrão do Benchmark no CI:**
   - Inserções em lote de milhares de registros (ex: 1.500 livros) para medir latência p95 (`queryCost < 150ms`) contra bancos em nuvem.
   - Benchmarks devem ficar em diretórios e scripts dedicados (`scripts/benchmarks/`), nunca na suíte padrão de CI.
5. **Sincronismo Assíncrono por Números Mágicos:**
   - Identificar loops do tipo `for (let i = 0; i < 5; i++) { await Promise.resolve(); await nextTick() }` ou `setTimeout(50)`.
   - Substitua por espera baseada em predicados (`await vi.waitFor(...)`).

---

## 2. Checklist Rápido de Auditoria em 5 Passos

Quando for acionado para avaliar ou debugar qualquer suíte de testes:

1. **Inspeção de Configuração:**
   - [ ] Há build obrigatório não automatizado no script `test`?
   - [ ] Há globs manuais listando arquivos por nome em vez de convenções de diretório/sufixo?
   - [ ] `clearMocks`, `restoreMocks` ou `unstubGlobals` estão ativos?
2. **Execução em Condições Adversas:**
   - [ ] Como a suíte se comporta sem banco/variáveis de ambiente? (Dá erro ou sai com 0?)
   - [ ] A suíte sobrevive a `--sequence.shuffle`?
   - [ ] Os testes de arquivo individual passam isoladamente?
3. **Auditoria de Fixtures e Banco:**
   - [ ] Existem UUIDs fixos ou dados pré-cadastrados dependentes de outro seed?
   - [ ] O cleanup no `afterAll`/`afterEach` remove de fato todos os registros gerados?
   - [ ] As migrations são exercitadas a partir de um banco vazio?
4. **Inspeção de Mocks:**
   - [ ] Há injeção de stubs no `globalThis` que não são desfeitos?
   - [ ] Os mocks de banco simulam cláusulas `where` ou devolvem arrays fixos cegos?
5. **Auditoria de Asserções:**
   - [ ] As asserções de erro validam o status exato e o código de erro, e não apenas `.toThrow()`?
   - [ ] Há asserções que passariam caso o endpoint retornasse 500?
