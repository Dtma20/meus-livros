# TASK-049 - Global element reset and platform finish

## Context

Visual-audit round of 2026-09-28. Findings and measurements: [visual-audit-2026-09-28.md](../reports/visual-audit-2026-09-28.md). Agent prompt: [PROMPT-frontend-melhorias.md](../agent-prompts/PROMPT-frontend-melhorias.md). Tokens `--danger-text`, `--success`, `--highlight-soft`, `--highlight-glow` and `color-scheme: dark` are already in `tokens.css` (commit 2b4ec2f) - use them, do not edit `tokens.css`. Tasks 049-059 run in parallel; touch only the files listed below.

The audit measured Arial and the UA default `13.3333px` on buttons across seven routes (`<button>` does not inherit font), a blue tap flash (`-webkit-tap-highlight-color: rgba(51,181,229,.4)`) on every card, the UA `::selection`, no `theme-color`, and placeholders in the UA `#757575` (2.73:1 on `--input-bg`).

## Implementation requirements

1. In the global `<style>` of `app/app.vue` (not scoped): `button, input, select, textarea { font: inherit; }` and `button { color: inherit; }` - do not force `color` on inputs.
2. Same place: `a, button, [role="button"], summary { -webkit-tap-highlight-color: transparent; }`.
3. Same place: `::selection { background: var(--highlight); color: var(--bg-color); }`.
4. Same place: `input::placeholder, textarea::placeholder { color: var(--text-color); opacity: 1; }` (5.28:1 on `--input-bg`; typed text stays white, so the two remain distinct). Remove any conflicting `::placeholder` rule from `app/assets/css/forms.css` if present.
5. `nuxt.config.ts`, `app.head.meta` only: `{ name: 'theme-color', content: '#14181c' }`.
6. Buttons that relied on the UA 13.33px must still look right: after the reset they inherit 16px. Where a component sets no font-size and 16px is visibly too big, that is a finding to report - do not edit components (other tasks own them).

## Explicitly excluded

- Any component file. `tokens.css`. CSP or other `nuxt.config.ts` keys.

## Expected files

```
app/app.vue
app/assets/css/forms.css
nuxt.config.ts
```

## Acceptance criteria

- [ ] No text element on `/`, `/@MeusLivros`, `/entrada/{id}`, `/app/entrada/{id}/editar`, `/entrar` computes a `font-family` starting with anything but Inter or Lora (reviewer measures)
- [ ] No element computes `font-size: 13.3333px` on those routes
- [ ] SSR HTML of `/` contains `<meta name="theme-color" content="#14181c">`
- [ ] `getComputedStyle(document.querySelector('a.card')).webkitTapHighlightColor` is `rgba(0, 0, 0, 0)`
- [ ] Placeholder on `/entrar` measures ≥ 4.5:1 against `--input-bg`

## Definition of done

- [ ] `npm run lint`, `npm run typecheck`, `npm run test` pass (run by the reviewer, not the agent)
