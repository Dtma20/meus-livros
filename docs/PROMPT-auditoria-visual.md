# PROMPT - Auditoria visual aprofundada do frontend

> Uso: cole este bloco como prompt de um agente com navegador (Claude com o Browser pane, ou equivalente). É uma auditoria **somente leitura**: o agente observa, mede e relata. Não edita código, não commita.
> Escrito em 2026-09-28. A auditoria anterior ([frontend-audit.md](frontend-audit.md), 2026-09-20) foi sobre layout quebrado e funcionamento. Esta é sobre **qualidade visual**: se as telas são agradáveis, coerentes e com acabamento.

---

Você está no repo `meus-livros` (Nuxt 4 + Vue 3 + TypeScript). Produto: biblioteca de leituras social para ~30 amigos da faculdade, pt-BR, tema escuro, inspirado no Letterboxd. A turma usa **celular** e abre links pelo navegador interno do WhatsApp; o dono cura os livros num **notebook**.

Sua tarefa: responder, com evidência, à pergunta **"as telas estão realmente agradáveis?"** - e, onde não estão, dizer exatamente por quê e o que mudar.

## 0. Leia antes de abrir o navegador

1. `CLAUDE.md` (seções Frontend, Security, "Things that will look like bugs but are deliberate").
2. `docs/frontend.md` - a especificação. Note §7 (breakpoints, contraste) e §8 (tokens).
3. `docs/frontend-audit.md` - a auditoria de 2026-09-20. **Não repita os achados dela.** Para cada P0/P1 dela, diga só: corrigido, regrediu ou continua.
4. `docs/ux-round-2026-09-27.md` e as tasks `docs/tasks/039-*.md` a `048-*.md` - a rodada de polimento mais recente. O que elas mudaram é o que você mais precisa olhar com olho crítico.
5. `app/assets/css/tokens.css` e `app/assets/css/forms.css` - o sistema visual declarado.
6. `docs/architecture-review.md` - o que foi recusado de propósito.

Duas pistas já levantadas por `grep`, a confirmar (não são conclusões):

- `docs/frontend.md` §8 lista `--highlight: #40bcf4` (azul); `tokens.css` tem `--highlight: #f59e0b` (âmbar). Qual está na tela, e o resto da UI foi pensado para qual?
- Há ~340 cores hex literais em `app/**/*.vue`, das quais ~116 são fallback de `var(--x, #...)`. As outras ~220 podem ser cores fora do sistema. Meça quantas aparecem **renderizadas** e onde.

## 1. Ambiente - regras que já custaram caro

- **Nunca rode `npm run dev`, `nuxt build` ou nada que escreva `.nuxt` em `C:\Users\diogo\Documents\meus-livros`.** É o checkout do dono, com dev server na porta 3000. Crie um worktree de verificação com `node_modules` próprio e suba `npx nuxt dev --port 3100` de lá. `preview_start` roda na raiz do projeto, não no worktree: não use para subir servidor; use `navigate` para `http://localhost:3100`.
- Antes de concluir qualquer coisa, confirme que o servidor está servindo o código que você acha (mtime de `.nuxt/dev` no worktree).
- Banco local (docker, container `meus-livros-db`). Os 86 livros estão no usuário **`@MeusLivros`**, não `@dtma23`.
- Rotas `/app/**` exigem sessão. **Não crie conta nem digite senha**: peça ao dono que faça login no pane, ou audite só as rotas públicas e diga isso no relatório.
- **Não envie nenhum formulário.** Nada de criar, editar ou apagar leitura. Se abrir o `LogForm`, apague `meus-livros:log-draft` do `localStorage` no fim.
- Após navegação client-side, force reload completo antes de ler o console (a primeira carga depois de navegar não hidrata).

## 2. Escopo

**Rotas** (todas): `/`, `/entrar`, `/entrar/ativar`, `/entrar/senha`, `/@MeusLivros` (grade e diário), `/livro/{slug}` (um com capa, um sem capa, um com título longo), `/entrada/{id}` (com e sem resenha), `/membros`, `/atividade`, `/app/novo`, `/app/livro/novo`, `/app/entrada/{id}/editar`, `/app/perfil`, `/app/bem-vindo`, `/app/admin/convites`, uma URL inexistente (404) e a página de erro.

**Larguras**: 320, 375, 768, 1024, 1440, 1920. As duas que decidem são **375** (a turma) e **1440** (o dono). Toda rota tem screenshot nessas duas; as outras quatro só onde algo muda.

**Estados** por rota que tenha lista ou dado remoto: carregando (throttle de rede no DevTools ou `Slow 3G`), vazio, erro, cheio, e **conteúdo extremo**: título de 120 caracteres, autor com nome composto longo, livro sem capa, resenha de 2000 caracteres, perfil com 0 leituras, perfil com 86.

**Visitante**: anônimo e logado, onde a tela muda.

## 3. O que avaliar

Para cada dimensão abaixo existe uma parte **medível** (faça a medição) e uma parte de **julgamento** (dê a opinião, mas ancorada num princípio nomeado e numa alternativa concreta). "Melhorar o espaçamento" não é achado; "o `h1` do perfil tem 24px de margem acima e 8px abaixo, então gruda no bloco de stats em vez de no nome: inverter para 8/24" é.

### 3.1 Hierarquia e ponto focal
- Teste do olhar semicerrado (screenshot com blur de ~8px): qual é o **primeiro** elemento que salta? É o que deveria ser?
- Cada tela tem **um** elemento dominante? Conte quantos elementos disputam o primeiro nível (tamanho + peso + cor de destaque).
- A ação principal da tela é reconhecível em menos de 2 segundos em 375px?

### 3.2 Tipografia
- Liste os `font-size`, `font-weight` e `font-family` **computados** por página. Mais de ~6 tamanhos distintos numa tela é sinal de escala não respeitada. Quantos estão fora de `--font-size-*`?
- Inter e Lora estão de fato carregadas (`document.fonts`)? Houve troca visível de fonte (FOUT) ou salto de layout ao carregar?
- Papel de cada família: onde a serifa aparece, e isso é coerente entre páginas?
- Resenhas e bios: comprimento de linha em `ch` (ideal 45-75) a 375 e 1440, `line-height`, contraste do corpo de texto.
- Títulos longos: quebram bem, truncam com reticência ou estouram? Viúvas/órfãs em títulos de card?

### 3.3 Espaçamento e ritmo
- Colete margens, paddings e gaps computados. Quantos valores estão **fora** da escala `--space-*` (0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64)? Liste os 20 piores com seletor e arquivo.
- Ritmo vertical: as seções da mesma página usam o mesmo intervalo entre si?
- Alinhamento: bordas esquerdas de título, texto e grade caem na mesma linha? Meça `getBoundingClientRect().left`.
- Proximidade: rótulos estão mais perto do que descrevem do que do vizinho?

### 3.4 Cor
- Paleta renderizada: cores distintas de texto, fundo e borda por página. Quais não vêm de token?
- O destaque (`--highlight`) é escasso o bastante para significar algo? Conte quantos elementos o usam por tela. Se tudo é âmbar, nada é.
- Contraste medido (não estimado) de: texto secundário sobre `--bg-color`, texto sobre `--card-bg`, placeholder de input, texto desabilitado, estrelas vazias. AA exige 4.5:1 para texto normal.
- Verde, vermelho e âmbar: os verdes que aparecem (`#3fb950`, `#34d399`, `#00e054`) são três decisões ou um acidente?

### 3.5 Consistência de componentes
- Inventário de **botões**: para cada botão/link-botão visível, `background`, `color`, `border-radius`, `padding`, `font-size`, `font-weight`, `height`. Agrupe; cada grupo distinto é uma variante. Quantas variantes existem, e quantas deveriam?
- Mesmo inventário para inputs, selects, chips de gênero, cards e links de texto.
- A mesma ação tem a mesma aparência e o mesmo texto em todas as telas?
- Raios de borda: quantos valores distintos? Estão em `--radius-*`?

### 3.6 Capas e imagens
- Proporção das capas (esperado ~2:3): alguma esticada ou cortada de forma estranha? Meça `naturalWidth/naturalHeight` contra o box.
- O placeholder de livro sem capa é **bonito**, ou parece erro? Compare lado a lado com uma capa real na grade.
- O shimmer de carregamento (TASK-039) tem a mesma dimensão da capa final? Há salto quando a imagem chega?
- Tamanho do card a cada largura: nunca menor no desktop que no celular (regra da auditoria anterior).

### 3.7 Densidade e uso do espaço
- A 1440 e 1920: fração da largura que é gutter vazio. A tela parece deliberadamente arejada ou abandonada?
- A 375: algo parece espremido, com texto encostado na borda ou elementos colados?
- Linhas com conteúdo nas duas pontas e nada no meio (ex.: handle à esquerda, estrelas à direita, 700px de vazio).

### 3.8 Estados de interação e movimento
- Hover, focus-visible, active e disabled existem e são distinguíveis em botões, cards, links e estrelas?
- O anel de foco é visível sobre `--card-bg` e sobre capas?
- Transições: duração e easing coerentes? `prefers-reduced-motion` desliga tudo?
- Feedback de carregamento em botões ("Salvando…"): o botão muda de largura?

### 3.9 Acabamento de plataforma (onde apps escuros costumam falhar)
- `color-scheme` do documento: selects nativos, `<input type="date">`, scrollbars e o calendário nativo aparecem claros no tema escuro?
- **Autofill** do Chrome em `/entrar`: o campo fica com fundo amarelo/branco?
- `-webkit-tap-highlight-color` no celular: flash azul ao tocar em card?
- Barra de navegação inferior (TASK-037): respeita `env(safe-area-inset-bottom)`? Cobre conteúdo no fim da página?
- Cor de seleção de texto, favicon, `theme-color` da barra do navegador móvel.
- Imagem OG de `/entrada/{id}` e `/livro/{slug}`: como fica o card no WhatsApp? (Leia as meta tags com `curl`; julgue a composição.)

### 3.10 Sensação geral
- Em uma frase por tela: parece um app de leitura feito com carinho para amigos, ou um painel administrativo escuro?
- Compare com princípios do Letterboxd e StoryGraph (poster em primeiro lugar, texto contido, um destaque de cor), não com screenshots deles. Não proponha copiar layout.

## 4. Como medir

Rode este script em cada página, em 375 e 1440, e guarde o JSON junto do screenshot:

```js
(() => {
  const els = [...document.querySelectorAll('body *')].filter(e => e.getClientRects().length);
  const tally = f => { const m = {}; for (const e of els) { const v = f(getComputedStyle(e), e); if (v) m[v] = (m[v] || 0) + 1 } return Object.entries(m).sort((a, b) => b[1] - a[1]) };
  const scale = new Set([0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64]);
  const props = ['marginTop', 'marginBottom', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'rowGap', 'columnGap'];
  const offScale = [];
  for (const e of els) { const s = getComputedStyle(e); for (const p of props) { const n = Math.round(parseFloat(s[p])); if (n && !scale.has(n)) offScale.push(`${e.tagName.toLowerCase()}.${[...e.classList].join('.')} ${p}=${s[p]}`) } }
  const btn = [...document.querySelectorAll('button, [role=button], a[class*=btn], a[class*=button], input[type=submit]')].filter(e => e.getClientRects().length);
  const variants = {}; for (const b of btn) { const s = getComputedStyle(b); const k = [s.backgroundColor, s.color, s.borderRadius, s.padding, s.fontSize, s.fontWeight].join(' | '); variants[k] = (variants[k] || 0) + 1 }
  return {
    url: location.pathname, width: innerWidth,
    fontSizes: tally(s => s.fontSize), fontWeights: tally(s => s.fontWeight), fontFamilies: tally(s => s.fontFamily.split(',')[0]),
    textColors: tally(s => s.color), backgrounds: tally(s => s.backgroundColor === 'rgba(0, 0, 0, 0)' ? null : s.backgroundColor),
    radii: tally(s => s.borderRadius === '0px' ? null : s.borderRadius),
    offScaleSpacing: [...new Set(offScale)].slice(0, 40),
    buttonVariants: Object.entries(variants),
    colorScheme: getComputedStyle(document.documentElement).colorScheme,
    fontsLoaded: [...document.fonts].filter(f => f.status === 'loaded').map(f => `${f.family} ${f.weight} ${f.style}`),
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
  };
})()
```

Contraste: calcule a razão WCAG a partir das cores computadas (não do código-fonte), ou rode `tests/integration/axe.test.ts` no worktree com `dtma23` trocado por `MeusLivros` via `sed` temporário (depois `git checkout --` no arquivo). Axe cobre contraste; ele não cobre nada do resto desta lista.

Screenshots: salve fora do repositório (diretório temporário), nomeados `<rota>-<largura>-<estado>.png`, e liste os caminhos no relatório.

## 5. Proibições

1. Não edite código nem CSS "só para testar". Se precisar ver uma alternativa, use DevTools/`javascript_tool` na página e descreva a mudança; nada vai para arquivo.
2. Não proponha: tema claro, Tailwind, biblioteca de componentes, nova dependência, redesign completo, Pinia. Veja `docs/architecture-review.md`.
3. Não reverta decisões registradas: `RatingInput` é `role="slider"`; `BookCard` é um `<a>` único; breakpoints só em CSS; datas sem hora em UTC.
4. Não commite. O relatório fica no working tree; o dono decide.
5. Não leia `.env` nem imprima connection strings.

## 6. Severidade

- **P0** - parece quebrado ou faz o produto parecer amador no primeiro contato (o link aberto no WhatsApp).
- **P1** - desagradável de forma perceptível no dispositivo principal daquela tela (375 para a turma, 1440 para o dono).
- **P2** - inconsistência que um olho atento nota: duas variantes de botão para a mesma ação, espaçamento fora da escala.
- **P3** - acabamento.

Cada achado separa **objetivo** (medido, reproduzível) de **subjetivo** (julgamento). Subjetivo só entra com o princípio nomeado (hierarquia, proximidade, contraste, alinhamento, ritmo, consistência) e uma proposta concreta com valores.

## 7. Entrega

Escreva `docs/visual-audit-2026-09-28.md` no mesmo formato e idioma (inglês) de `docs/frontend-audit.md`:

1. **Method** - larguras, rotas, estados, sessão usada ou não, o que ficou de fora e por quê.
2. **Status of the 2026-09-20 findings** - uma linha por P0/P1: fixed / regressed / still open.
3. **Scorecard** - tabela rota × dimensão (3.1 a 3.9), nota 1-5, cada nota com uma frase de justificativa. Nota sem justificativa não vale.
4. **Findings** - por severidade. Cada um com: rota e largura, screenshot, medição, `arquivo:linha` responsável, e a mudança proposta com valores (token a usar, px, peso).
5. **System-level findings** - o que se repete em várias telas e deveria virar token ou primitivo em `app/components/ui/`, não correção pontual.
6. **What already works - do not regress it.**
7. **Proposed tasks** - no formato de `docs/tasks/`, cada uma com arquivos esperados e critérios **visuais e verificáveis** (ex.: "no máximo 5 `font-size` computados distintos em `/@MeusLivros` a 375px"; "nenhum botão fora de 3 variantes"; "`colorScheme` do documento é `dark`").

Sua mensagem final é um resumo de no máximo 15 linhas: as 5 coisas que mais pesam contra "agradável", e o caminho do relatório.
