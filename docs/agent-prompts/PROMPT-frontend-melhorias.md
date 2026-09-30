# PROMPT - Melhoria do frontend, em fatias

> Uso: cole este bloco como prompt de um agente que vai implementar **uma** das tasks 039-048 (`docs/tasks/`). O revisor preenche `<NNN>` e `<WORKTREE>`.
> Revisado em 2026-09-27: a versão anterior mandava converter `RatingInput` em radiogroup, aplicar `America/Sao_Paulo` a datas sem hora e rodar build/testes no checkout onde o dono roda `npm run dev` - as três causavam dano.

---

Você está no repo `meus-livros` (Nuxt 4 + Vue 3 `<script setup>` + TypeScript `strict`, Vitest, ESLint Nuxt). Produto: biblioteca de leituras pt-BR, tema escuro, estilo Letterboxd. A turma usa celular e abre links pelo navegador interno do WhatsApp.

Sua task é a **TASK-<NNN>**: `docs/tasks/<NNN>-*.md`. Leia a task inteira, inclusive "Explicitly excluded", e depois `CLAUDE.md` (seções Frontend, Security, Testing, Git) e `docs/agent-prompts/repo-state.md`.

## 0. Onde trabalhar

- **Somente dentro de `<WORKTREE>`**, na branch já criada ali. Nunca edite `C:\Users\diogo\Documents\meus-livros` (é o checkout do dono, com `npm run dev` rodando).
- Nada de `git checkout`, `switch`, `merge`, `rebase`, `push`. Não toque em `develop` nem `main`.
- Ao terminar: **exatamente um commit** na branch, mensagem conventional em inglês, adicionando só os caminhos que você alterou (`git add <caminho>`, nunca `-A` / `.`).

## 1. O que você NÃO roda

Build, dev server, `npm run test`, typecheck ou lint da árvore inteira: o worktree não tem `node_modules` e o revisor roda tudo depois, num worktree de verificação. Rodar `nuxt build` / `nuxt dev` na pasta errada já derrubou o servidor do dono duas vezes. Comandos permitidos: `git status/diff/log`, leitura de arquivos, `grep`.

## 2. Proibições

1. Não leia `.env*`, segredos, `process.env` com valores reais. Não imprima connection strings.
2. Toque **somente** nos arquivos listados em "Expected files" da sua task. Outras tasks rodam em paralelo nos arquivos vizinhos.
3. `v-html` é banido. Reviews são texto puro (`ReviewText.vue`).
4. `app/**` nunca importa de `server/**`, nem tipo. Contrato compartilhado mora em `shared/`.
5. Sem `any` (use `unknown` + narrowing), sem `console.log`, sem comentário explicativo no código (o repo não tem comentários; a justificativa vai no relatório), sem valor mágico que duplique token de `app/assets/css/tokens.css`.
6. Se a melhoria precisar de um dado que a API não envia, **pare e relate** - não mexa em `server/**`.

## 3. Decisões já tomadas - não reverta

- `RatingInput` é `role="slider"` com `aria-valuetext`, de propósito (TASK-021). Não converta em radiogroup.
- **Datas:** timestamps (`created_at`) usam `formatFullDate` / `formatRelativeDate` (`America/Sao_Paulo`). **Datas sem hora** (`finished_on`, `started_on`) usam `formatReadingDate` de `app/utils/entry.ts` (UTC + precisão dia/mês/ano). Formatar `"2024-01-01"` em São Paulo mostra 31/12/2023.
- Rótulos gerados em SSR nunca vêm de `Intl` com dados de país ou de ICU: Node e Chrome divergem e a hidratação quebra.
- Breakpoints só em CSS (`@media`), nunca `matchMedia` decidindo o DOM: SSR e cliente precisam renderizar o mesmo HTML.
- `BookCard` é um `<a>` único, sem elemento interativo dentro. `BookCover` exige `alt` (decorativo = `alt=""`).
- Sem light theme, sem Pinia, sem sitemap (ver `docs/architecture-review.md`).
- CSP em `nuxt.config.ts`: não afrouxe.

## 4. Checklist da sua edição

- [ ] Sem `window` / `document` / `localStorage` no topo do `setup()`; só em `onMounted` ou handlers.
- [ ] Composables do Nuxt resolvidos no `setup()`, antes de qualquer `await`.
- [ ] Todo `$fetch` no cliente com `timeout`; GET com `retry: 0`.
- [ ] Alvo de toque ≥ `var(--target-min-size)` (44px) no celular; nunca abaixo de 24px.
- [ ] 320px sem scroll horizontal. `prefers-reduced-motion` desliga animação nova.
- [ ] Toda lista nova: loading (skeleton com a mesma dimensão), erro (com retry, sem stack) e vazio (com ação).
- [ ] Copy em pt-BR, falando com um amigo.

## 5. Testes

Vitest. Teste unitário para lógica pura e para o componente que você mudou (`// @vitest-environment happy-dom` na primeira linha do arquivo novo; copie os stubs `vi.hoisted` de `tests/unit/routes.test.ts` se montar algo que usa `useRoute`/`navigateTo`/`useId`). Sem snapshot, sem E2E. Escreva o teste; o revisor roda.

## 6. Relatório

Sua mensagem final é o relatório, e só ele (subagentes não conseguem gravar `REPORT.md`):

```
ARQUIVOS: <um por linha, + novo, ~ alterado>
CRITERIOS: <um por linha: FEITO | NAO FEITO | INCERTO - motivo>
DECISOES: <o que um revisor questionaria>
RISCOS: <o que pode estar errado no seu trabalho>
FORA DE ESCOPO NOTADO: <o que viu e não tocou>
```

`CRITERIOS` fala do que você implementou, não do que testou. `INCERTO` é melhor que otimismo.
