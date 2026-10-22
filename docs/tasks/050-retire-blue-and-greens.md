# TASK-050 - Retire the old blue and the ad-hoc greens

## Context

Visual-audit round of 2026-09-28. Findings and measurements: [visual-audit-2026-09-28.md](../reports/visual-audit-2026-09-28.md). Agent prompt: [PROMPT-frontend-melhorias.md](../agent-prompts/PROMPT-frontend-melhorias.md). Tokens `--danger-text`, `--success`, `--highlight-soft`, `--highlight-glow` and `color-scheme: dark` are already in `tokens.css` (commit 2b4ec2f) - use them, do not edit `tokens.css`. Tasks 049-059 run in parallel; touch only the files listed below.

`rgba(64,188,244,*)` - the blue `#40bcf4` from the original palette - survives as focus glows and selected-state fills while the UI is amber: `LogForm.vue:993,1059,1200`, `AddBookForm.vue:1016`, `bem-vindo.vue:329`, `perfil.vue:531,604`. Four greens mean "success": `#3fb950` (`JsonImportSection.vue:517,609`), `#34d399` (`convites.vue:404,502`, `perfil.vue:638`, `entrar/senha.vue:524`), `#10b981` (`LandingPillars.vue:317`), and `#00e054` as a dead fallback of `var(--highlight, #00e054)` (`JsonImportSection.vue:440-471`). `LogForm`'s "Remover da biblioteca" measures 3.86:1 (`--danger` on `--card-bg`). `docs/frontend.md` §8 still documents the blue palette.

## Implementation requirements

1. Focus glows `0 0 0 2px rgba(64,188,244,.2)` → `0 0 0 2px var(--highlight-glow)`.
2. Selected fills `rgba(64,188,244,.15)` / `.08` → `var(--highlight-soft)`.
3. Every success green → `var(--success)`; drop the `#00e054` fallbacks (write `var(--highlight)`).
4. `LogForm.vue` text-only danger (`.delete-btn` and any other text in `--danger` on a card) → `var(--danger-text)`. Filled danger backgrounds keep `--danger`.
5. `docs/frontend.md` §8: replace the palette block with the tokens actually in `app/assets/css/tokens.css` (copy the color lines verbatim, including the new state tokens) and delete the sentence about porting `styles.css` as-is.

## Explicitly excluded

- `app/pages/entrada/[id].vue` (TASK-053 owns its green and danger). `tokens.css`. Any layout or copy change.

## Expected files

```
app/components/log/LogForm.vue
app/components/search/AddBookForm.vue
app/pages/app/bem-vindo.vue
app/pages/app/perfil.vue
app/components/log/JsonImportSection.vue
app/pages/app/admin/convites.vue
app/pages/entrar/senha.vue
app/components/landing/LandingPillars.vue
docs/frontend.md
```

## Acceptance criteria

- [ ] `grep -rniE "64, ?188, ?244|#40bcf4|#0083e0" app` returns nothing
- [ ] `grep -rhoiE "#(3fb950|34d399|00e054|10b981)" app --include=*.vue` returns only lines in `app/pages/entrada/[id].vue` (TASK-053)
- [ ] `LogForm` "Remover" measures ≥ 4.5:1 on `--card-bg` (`#f87171` gives 5.25:1)
- [ ] `docs/frontend.md` §8 has no `#40bcf4`

## Definition of done

- [ ] `npm run lint`, `npm run typecheck`, `npm run test` pass (run by the reviewer, not the agent)
