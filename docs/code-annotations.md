# Decisões de Código e Notas de Implementação

Este documento centraliza as decisões técnicas, regras de negócio não óbvias, tratamentos de casos de borda, peculiaridades de navegadores, acessibilidade e especificidades de CSS que antes estavam documentadas como comentários no código-fonte do **meus-livros**.

Ele serve como referência de manutenção para desenvolvedores e agentes autônomos, garantindo que o código-fonte permaneça limpo e conciso sem perder o contexto crítico de engenharia.

---

## Índice

1. [CSS Global e Tokens de Design](#1-css-global-e-tokens-de-design)
2. [Componentes da Aplicação (`app/components/`)](#2-componentes-da-aplicação)
   - [Livros e Avaliações](#livros-e-avaliações)
   - [Dashboard e Carrossel](#dashboard-e-carrossel)
   - [Feed e Atividade](#feed-e-atividade)
   - [Página Inicial (Landing)](#página-inicial-landing)
   - [Registro e Formulários de Leitura](#registro-e-formulários-de-leitura)
   - [Busca e Adição de Obras](#busca-e-adição-de-obras)
   - [Perfil e Mapa de Leitura](#perfil-e-mapa-de-leitura)
   - [Estatísticas](#estatísticas)
   - [Interface do Usuário (UI)](#interface-do-usuário-ui)
3. [Composables e Estado Reativo (`app/composables/`)](#3-composables-e-estado-reativo)
4. [Layouts e Páginas (`app/layouts/` e `app/pages/`)](#4-layouts-e-páginas)
   - [Layout Logado (`app.vue`)](#layout-logado-appvue)
   - [Páginas de Perfil (`@[handle]`)](#páginas-de-perfil-handle)
   - [Fluxo de Entrada e Edição (`app/entrada/`, `app/novo`)](#fluxo-de-entrada-e-edição)
   - [Páginas Públicas (`livro/[slug]`, `entrada/[id]`, `membros`, `atividade`)](#páginas-públicas)
5. [Serviços de Backend (`server/services/`)](#5-serviços-de-backend)
6. [Esquemas Compartilhados (`shared/schemas/`)](#6-esquemas-compartilhados)
7. [Testes Automatizados (`tests/`)](#7-testes-automatizados)

---

## 1. CSS Global e Tokens de Design

### `app/assets/css/fonts.css`
- **Fontes variáveis auto-hospedadas**: As fontes são servidas localmente a partir de `public/fonts` (com as respectivas licenças no mesmo diretório). Utiliza-se um subset latino que cobre integralmente o português brasileiro (pt-BR), evitando dependência de CDNs externas em tempo de execução.

### `app/assets/css/forms.css`
- **Tema escuro unificado sem acento amarelo**: As variantes primária e secundária de botões e campos de formulário utilizam `--surface-input` e `--border-color`, eliminando a presença de detalhes amarelos desalinhados com a identidade visual do projeto.
- **Variantes de botões**:
  - *Perigo (`.btn-danger`)*: Borda e texto com tom de aviso avermelhado para ações destrutivas irreversíveis.
  - *Fantasma/Contorno (`.btn-ghost`, `.btn-outline`)*: Mesmo preenchimento neutro e borda compartilhada, destacando apenas sob foco ou interação.
  - *Modificadores e tamanhos*: Definições de `.btn-sm`, `.btn-block` e alinhamento de ícones internos.
  - *Containers de ações (`.form-actions`)*: Flexbox com espaçamento padronizado e ordenação móvel.

---

## 2. Componentes da Aplicação

### Livros e Avaliações

#### `app/components/book/RatingHistogram.vue`
- **Variantes do histograma**: O componente aceita a propriedade `size`:
  - `small`: Versão compacta (sparkline de 120x36px) utilizada na visualização de detalhes da obra (`/livro/[slug]`).
  - `large`: Versão expandida utilizada nas páginas de estatísticas (`/@[handle]/estatisticas`), contendo uma linha rotulada com valor numérico e quantidade para cada meia estrela (0.5 a 5.0).

### Dashboard e Carrossel

#### `app/components/dashboard/ReadingCarousel.vue`
- **Área de clique estendida (Tap Target)**: O link do título do livro contém um pseudo-elemento `::after` com `position: absolute; inset: 0`, estendendo a área de clique para o cartão inteiro. Isso melhora drasticamente a usabilidade em dispositivos móveis, evitando que o usuário precise acertar uma única linha de texto.

#### `app/components/dashboard/ShelfSection.vue`
- **Camadas de toque independentes na estante**: Semelhante ao carrossel, o link do título se expande por toda a linha da estante; no entanto, o botão secundário "Começar a ler" possui posicionamento relativo e `z-index` elevado para permanecer como um alvo de clique independente sem disparar a navegação da linha.

### Feed e Atividade

#### `app/components/feed/NewPostsPill.vue`
- **Animações de entrada e saída**: A pílula indicadora de novos posts no feed ("X novos posts") utiliza transições Vue CSS (`transition: all var(--transition-normal)`) com translação vertical (`translateY(-8px)` para `translateY(0)`) e fade, garantindo entrada suave no topo da lista.

### Página Inicial (Landing)

#### `app/components/landing/LandingHero.vue`
- **Lombadas geradas em CSS puro**: Os livros exibidos na estante da hero section não usam imagens externas; são renderizados puramente em CSS a partir dos dados do acervo histórico original (`legacy/livros.json`), respeitando a ordem cronológica em que foram lidos.
- **Mapeamento de tons (`tone`)**:
  - `1`: Fundo de cartão (`--surface-card`)
  - `2`: Fundo de campo (`--surface-input`)
  - `3`: Cor principal de texto (`--text-color`)
  - `4`: Destaque/highlight (representa o livro do registro em evidência logo abaixo)

#### `app/components/landing/LandingView.vue`
- **Identidade e estrutura visual (Hallmark Editorial)**:
  - Critérios de design pre-emit: P4 H4 E4 S4 R4 V4.
  - Macroestrutura baseada no formato *Long Document* (hero com estante desenhada em CSS, entrada de leitura em marginalia, listagem em formato de ficha de especificações).
  - Enriquecimento Tier A em CSS puro sem bibliotecas pesadas.
  - O cabeçalho e o rodapé pertencem exclusivamente aos layouts Nuxt (`app/layouts/`), não sendo manipulados pelo componente.

### Registro e Formulários de Leitura

#### `app/components/log/LogForm.vue`
- **Resumo de edição compacta**: Quando a seção de edição está recolhida, o componente exibe um resumo textual de uma linha da edição selecionada (título, editora, páginas).
- **Proteção contra sobrescrita de rascunhos**: Se houver um rascunho salvo em `localStorage` pertencente a uma obra diferente daquela que o usuário está abrindo, o formulário preserva o rascunho anterior em armazenamento, mas evita que o observador de montagem do Vue o sobrescreva até que o usuário interaja intencionalmente com o novo formulário.
- **Atalho "Terminei" (`?terminar=1`)**: O fluxo acionado via atalho "Terminei" só é válido para leituras com status em andamento (`lendo`). Ao abrir a edição, o formulário já vem preparado para a conclusão da leitura.
- **Renderização SSR em modo de edição**: No modo de edição de uma entrada já existente, o formulário preenche seus campos diretamente no ciclo síncrono de `setup`. Isso garante que o SSR entregue o formulário preenchido de imediato, em vez de passar pela tela intermediária de busca de livros. O acesso a `window` e `localStorage` é evitado no servidor; restaurações de rascunho só operam no `onMounted` em modo de criação.
- **Coerência de capas**: As regras de fallback de capa no formulário são idênticas às aplicadas na página de detalhes da leitura (`entrada/[id].vue`).
- **Prevenção contra perda de dados**: O formulário mantém uma cópia do estado inicial carregado e compara com o estado atual:
  - Navegações internas dentro do aplicativo Nuxt abrem um modal de confirmação ("Sair sem salvar?").
  - Fechar a aba ou recarregar a janela aciona o evento nativo `beforeunload` do navegador.
  - Salvar com sucesso ou acionar a remoção da leitura contornam essa verificação, navegando sem alertas.
  - A tecla Escape fecha o diálogo de confirmação e mantém o usuário no formulário.
- **Fuso horário e datas**: O servidor opera em UTC, enquanto o público-alvo reside em UTC-3. Se a data padrão fosse calculada no servidor, qualquer livro registrado após as 21:00 seria marcado com a data do dia seguinte. Portanto, a data de hoje é sempre obtida localmente pelo navegador no cliente.
- **Delegação de exclusão**: Ao clicar em "Remover esta leitura" dentro do formulário de edição, a ação não executa um `DELETE` imediato nem coloca parâmetros na URL (o que permitiria disparos acidentais via links compartilhados). O formulário grava o identificador em um estado em memória no histórico de navegação (`entry:remove-request`) e redireciona para a página da entrada, onde a contagem regressiva com opção de "Desfazer" é iniciada.

#### `app/components/log/ReadingBlocksSection.vue`
- **Limite de páginas**: O total de páginas cadastrado na edição atua como teto superior de validação para as páginas de início e término dos trechos lidos.
- **Acessibilidade e ciclo de foco**: O botão que abre o formulário de novo bloco é ocultado (`v-if`) durante a edição. Ao abrir, o foco é transferido para o campo "Página inicial"; ao fechar ou cancelar, o foco retorna ao botão de abertura (ou ao botão do cabeçalho da seção se o botão original tiver sido desmontado).
- **Exclusão com "Desfazer" (Undo countdown)**: Ao excluir um trecho, ele é removido imediatamente da lista na interface e um botão de "Desfazer" permanece ativo por 6 segundos antes do envio do `DELETE` para o backend:
  - Um segundo clique em "Excluir" em outro bloco confirma a exclusão pendente imediatamente.
  - Sair da página ou navegar para outra rota confirma a exclusão no ato da desmontagem.
  - Fechamento da aba utiliza requisição `$fetch` com `keepalive: true` para garantir que o descarregamento da página não interrompa a requisição no navegador.

### Busca e Adição de Obras

#### `app/components/search/AddBookForm.vue`
- **Padrão unificado de recuperação de erros**: Em conformidade com o `LogForm`, ao encontrar erros de validação:
  1. Um resumo em banner é exibido logo acima do botão de submissão;
  2. A página rola até o primeiro campo inválido;
  3. Se o campo inválido estiver dentro de um elemento `<details>` fechado, o componente abre o disclosure automaticamente antes de focar o input.
- **Detecção de rascunho com conteúdo real**: O rascunho salvo só é considerado com dados do usuário se contiver informações além daquelas que foram pré-preenchidas automaticamente pela busca anterior.
- **Limpeza de rascunhos**: Os observadores de campo re-salvam os valores no ciclo de atualização; a limpeza do armazenamento é executada após esse flush para evitar que resquícios de rascunho fiquem gravados.

#### `app/components/search/HeaderSearch.vue`
- **Escopo restrito à página**: A busca do cabeçalho opera isolada por tela. Ao navegar para uma nova rota, a gaveta móvel é fechada e tanto o termo quanto os resultados são resetados para evitar que buscas residuais contaminem a página de destino.

#### `app/components/search/SearchBox.vue`
- **Opção de cadastro manual no final da lista**: Sempre que há resultados de busca, o último item do seletor navegável por teclado é "Adicionar livro novo" (índice correspondente a `results.length`).
- **Reset de busca**: O método de reset retorna o componente ao estado virgem (sem texto, sem resultados e com lista recolhida). Caso o campo permaneça focado, digitar novamente reabre a listagem imediatamente.
- **Estilo herdado**: O botão de submissão herda de `.btn.btn-primary.btn-sm`.

### Perfil e Mapa de Leitura

#### `app/components/profile/ReadingMap.vue`
- **Tolerância a falha em `localStorage`**: Se o armazenamento local estiver desabilitado (por exemplo, navegação anônima estrita com cookies de terceiros bloqueados), as falhas de leitura ou gravação do estado aberto/fechado do mapa são ignoradas silenciosamente.
- **Reserva de altura vertical no CSS**: A área de detalhes do país no mapa possui altura mínima reservada (`min-height`) para evitar que passar o cursor do mouse sobre diferentes países empurre o layout do mapa para baixo (*layout shift*).

### Estatísticas

#### `app/components/stats/YearColumns.vue`
- **Ordenação cronológica com scroll inicial**: O gráfico de barras anuais lista os anos em ordem crescente (do mais antigo para o mais recente). O container é automaticamente rolado para a extrema direita na montagem, permitindo que o usuário veja imediatamente o ano corrente/mais recente.
- **Isolamento de SSR**: Essa rolagem ocorre estritamente dentro do `onMounted`, garantindo integridade na hidratação SSR.

### Interface do Usuário (UI)

#### `app/components/ui/ShortcutsDialog.vue`
- **Estilos de botão**: Herda os tokens de estilo de `.btn.btn-secondary`.

---

## 3. Composables e Estado Reativo

### `app/composables/useFeedNewPosts.ts`
- **Polling em segundo plano**:
  - Execução periódica a cada 60 segundos (configurável), restrita a momentos em que o documento está visível (`document.visibilityState === 'visible'`).
  - Throttling de 15 segundos em eventos de foco da janela (`window.onfocus`) ou mudança de visibilidade, evitando requisições em rajada.
  - Falhas de rede durante o polling periódico são suprimidas silenciosamente para não interromper a navegação do usuário com mensagens de erro invasivas.
- **Detecção inteligente de itens novos**:
  - Compara o identificador do topo da lista exibida com a lista recém-recebida.
  - Se o item do topo for encontrado na nova lista, todos os itens posicionados antes dele são computados como novos.
  - Se o item do topo não foi alterado, o estado permanece inalterado.
  - Caso o item do topo tenha sido deslocado além da página recebida, o composable faz a verificação contra o conjunto completo de IDs conhecidos.

### `app/composables/useFlash.ts`
- **Mensagens Flash de consumo único**: Implementa mensagens que sobrevivem a transições de rota no lado do cliente: a página emissora invoca `set()` antes de chamar `navigateTo()`, e o layout logado consome e limpa a mensagem via `consume()` ao montar ou ao detectar alteração. A utilização de `useState` garante isolamento seguro por requisição durante a renderização no servidor (SSR).

### `app/composables/useKeyboardShortcuts.ts`
- **Atalho dinâmico `g p`**: O destino da combinação rápida de teclado `g p` (ir para o perfil) é avaliado a cada execução, obtendo o `handle` do usuário a partir da sessão ativa no momento.
- **Janela de combinação de duas teclas**: Durante o intervalo de espera entre a primeira e a segunda tecla, uma dica visual e acessível (via `aria-live`) é apresentada ao usuário.
- **Prevalência de diálogos modais**: Quando qualquer modal está aberto, os atalhos globais de teclado são desabilitados, transferindo o controle do teclado exclusivamente para o diálogo modal em primeiro plano.

### `app/composables/useScrollReveal.ts`
- **Reativação de animações de rolagem**: Quando um elemento sai da área visível pela parte inferior da tela, o composable remove o estado revelado (`is-revealed = false`), permitindo que a animação de deslizamento para cima aconteça novamente quando o usuário rolar de volta.

---

## 4. Layouts e Páginas

### Layout Logado (`app.vue`)

- **Renderização estritamente client-side das mensagens flash**: As notificações flash nascem de interações ocorridas no navegador do cliente; renderizá-las prematuramente no SSR causaria falhas de hidratação (*hydration mismatch*).
- **Sobrescrita de especificidade CSS**: O layout base `default.vue` fixa `button.nav-link` em 36px com a regra `.site-nav :deep(...)`. Para vencer essa regra de forma determinística sem depender da ordem de injeção dos arquivos CSS, o layout `app.vue` utiliza uma cadeia com quatro classes.
- **Compensação para telas sensíveis ao toque (Touch Targets)**: Em desktops com tela de toque, os botões recebem padding aumentado; margens negativas de -8px compensam esse crescimento, mantendo a altura da barra do cabeçalho fixa.
- **Alinhamento do avatar**: O círculo do avatar (28px de diâmetro) é ligeiramente mais alto que os ícones da barra (22px). Aplica-se uma margem negativa para manter seu rótulo na mesma linha de base dos demais links.

### Páginas de Perfil (`@[handle]`)

#### `app/pages/@[handle]/ano/[ano].vue` e `estatisticas.vue`
- **Grid responsivo de 2 colunas em celulares**: Os cartões de estatísticas são organizados em duas colunas no mobile. Caso haja um número ímpar de cartões, o último elemento se expande pelas duas colunas (`grid-column: span 2`), impedindo que uma linha fique com apenas um cartão de meia largura.

#### `app/pages/@[handle]/index.vue`
- **Carregamento assíncrono postergado**: Módulos pesados (como gráficos e visualizações complexas) são carregados apenas após a montagem do componente, garantindo que o Suspense principal da página não seja bloqueado.
- **Cálculo de totais do cabeçalho**: Os contadores do cabeçalho descrevem todo o acervo visível ao usuário. Eles reagem aos filtros de gênero, país e década (indicados por `(filtros ativos)`), mas são independentes das abas de visibilidade do proprietário (público/privado), cuja contagem específica fica ao lado do grid ("Mostrando N de M livros").
- **Sincronização com query params da URL**: Os filtros selecionados são refletidos nos parâmetros da URL para que o link possa ser compartilhado e recarregado sem perda de estado. Valores inválidos ou que não existem mais no acervo são descartados silenciosamente.

### Fluxo de Entrada e Edição

#### `app/pages/app/entrada/[id]/editar.vue`
- **Parâmetro `?terminar=1`**: Identifica que o formulário foi aberto via atalho rápido de conclusão de leitura, inicializando os campos com a data atual e status de concluído.
- **Race condition no SSR com slugs de obra**: Durante a renderização no servidor, a busca da entrada e a busca da obra são executadas em paralelo. Em certas circunstâncias o slug da obra ainda não estava disponível ao iniciar a busca dependente, o que faria o payload carregar `null`. Como o slug não mudava após a hidratação, o `watch` nunca refazia a consulta. Implementou-se um fallback explícito para garantir a re-execução correta.

#### `app/pages/app/novo.vue`
- **Gestão de foco acessível ao selecionar livro**: Ao escolher uma obra na listagem de busca, o componente substitui a tela pelo formulário. Sem um redirecionamento de foco intencional, o foco voltaria para o `<body>`. O código direciona o foco para o título principal do formulário e anuncia via leitor de tela o livro selecionado. Em acessos diretos com `?work_id=...`, o foco original atribuído pelo navegador é preservado.

### Páginas Públicas

#### `app/pages/atividade.vue`
- **Barra lateral responsiva**: Em larguras de viewport inferiores a 1024px, a barra lateral é ocultada, pois seu conteúdo apenas repetiria as informações já visíveis no feed central.

#### `app/pages/entrada/[id].vue`
- **Preservação de parâmetros na transição de saída**: Ao iniciar a navegação de saída da página, o `route.params.id` já reflete o destino (ou fica indefinido). O identificador da leitura a ser excluída é obtido diretamente do objeto de dados carregado na página, que permanece estável durante toda a animação de saída.
- **Desistência e confirmação de exclusão na navegação**: A contagem regressiva de exclusão com "Desfazer" não é cancelada se o usuário sair da página: a intenção de remover já foi expressa e fora da página não haveria interface para desfazer. A requisição de `DELETE` é disparada imediatamente e o feedback visual de sucesso é encaminhado para ser exibido pelo layout na página de destino.
- **Conexão mantida com `keepalive`**: Fechar a aba ou janela durante uma requisição tradicional em `$fetch` causa cancelamento pelo navegador. O envio utiliza a flag `{ keepalive: true }` para garantir que o navegador complete a requisição mesmo após o descarregamento da página.
- **Proteção contra cache de histórico do navegador (bfcache)**: Quando o usuário clica no botão "Voltar" do navegador, a página pode ser recuperada da memória do bfcache exibindo um registro que acabou de ser apagado. O componente detecta esse estado no evento `pageshow` e redireciona imediatamente o usuário para a sua biblioteca.
- **Recepção de pedidos de remoção do formulário**: Ao vir de `/app/entrada/[id]/editar` com um pedido de exclusão gravado em `history.state['entry:remove-request']`, a página consome o pedido na primeira leitura e inicia a contagem com o botão "Desfazer". Recarregar a página não repete o pedido, pois o estado já foi consumido da memória.
- **Ajustes de touch target e especificidade CSS**:
  - Alvos de toque em botões de navegação utilizam padding expandido com margens negativas para não quebrar o alinhamento da linha de base.
  - A classe `.book-card-section` tem sua ordem de declaração respeitada para evitar que `flex-direction: row` esprema o título e os metadados ao lado da capa em larguras menores.
  - A coluna da direita se alinha ao topo independentemente de qual seção (resenha, progresso ou resumo) for exibida em primeiro lugar.

#### `app/pages/livro/[slug].vue`
- **Formatação de contagem de avaliações**: Na linha de resumo (ex: "4,5 · 1 nota · 2 leituras"), a quantidade de notas só é exibida separadamente quando for diferente da quantidade total de leituras, evitando a ambiguidade visual de parecer que uma única avaliação se aplica a múltiplas leituras.
- **Fluxo de exclusão e bfcache na página da obra**: Adota o mesmo padrão de contagem com "Desfazer", confirmação na desmontagem, `keepalive` no descarregamento e redirecionamento de histórico bfcache se o livro tiver sido excluído.
- **Design de superfície única**: A página da obra foi desenhada como superfície contínua, sem cartão envoltório (*no wrapper card*), delimitando seções apenas com linhas de divisão horizontais.

#### `app/pages/membros.vue`
- **Detecção de sessão em rota pública**: Como o middleware de autenticação só é executado automaticamente sob o prefixo `/app/**`, acessos diretos à página pública `/membros` executam uma chamada client-side a `/api/users/me` para identificar o handle do usuário logado e destacar seu perfil na lista de membros.
- **Miniaturas de capa em celulares**: Em telas menores, a faixa de capas ao lado do nome do membro exibe três miniaturas ligeiramente mais compactas, em vez de quatro.

---

## 5. Serviços de Backend

### `server/services/feed.ts`
- **Cache da página principal do feed**: A primeira página do feed de atividades públicas é armazenada em cache em memória por 30 segundos (`FEED_CACHE_TTL_MS = 30_000`).
- **Invalidação imediata**: A função `invalidateFeedCache()` limpa integralmente o cache em memória sempre que uma nova leitura pública é criada, editada ou removida.

---

## 6. Esquemas Compartilhados

### `shared/schemas/profile.ts`
- **Resiliência na formatação de nomes de países**: A função `formatCountryName` consulta a API padrão `Intl.DisplayNames`. Caso receba um código de país inválido ou não padronizado (como designações históricas ou personalizadas do acervo), o bloco `try/catch` captura a exceção e utiliza o rótulo original informado pelo usuário como fallback.

---

## 7. Testes Automatizados

### `tests/integration/routes.test.ts`
- **Prevenção de conflitos de parâmetros no roteador Nitro**: Arquivos irmãos com parâmetros com nomes distintos no mesmo diretório (como `[slug].get.ts` e `[id]/`) faziam o roteador interno do Nitro descartar sub-rotas como `/:id/editions`. A estrutura de rotas mantém coerência de parâmetros para evitar que rotas de edições fiquem vazias.

### `tests/unit/feed-cache.test.ts`
- **Mocks com interface Thenable**: Nos testes do cache do feed, o encadeamento de chamadas do Drizzle ORM é simulado como um objeto *thenable*, garantindo que a resolução com `await` retorne os resultados corretos sem disparar novas consultas ao banco de dados durante os testes de acerto de cache.

### `tests/unit/use-book-filters.test.ts`
- **Cálculo de décadas para anos negativos (a.C.)**: Para anos antes de Cristo, o arredondamento matemático para baixo agrupa corretamente séculos e décadas. Exemplo: o ano `-49` pertence à década de `-50` (`Math.floor(-49 / 10) * 10 = -50`).

### `vitest.config.ts`
- **Isolamento de ambientes (`dom` vs `node`)**:
  - Testes que montam componentes Vue ou interagem com o DOM são executados no projeto `dom` sob o ambiente `happy-dom`.
  - Testes de serviços, banco de dados e utilitários que dependem de sockets puros e servidores HTTP reais (como `fetch-error.test.ts`) rodam no projeto `node`.
  - A declaração centralizada de padrões de inclusão no `vitest.config.ts` elimina a necessidade de diretivas `// @vitest-environment happy-dom` nos arquivos de teste.
