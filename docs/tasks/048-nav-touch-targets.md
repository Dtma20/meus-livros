# TASK-048 - Header links big enough to tap

## Context

Frontend round of 2026-09-27. Agent prompt: [PROMPT-frontend-melhorias.md](../agent-prompts/PROMPT-frontend-melhorias.md). Runs in parallel with the other tasks 039-048; touch only the files listed below.

Header nav links measure 19px tall on a phone (`docs/frontend-audit.md`); `.nav-link` has `min-height: 28px`. The "Entrar" link (anonymous, `app/layouts/default.vue`) and "Sair" (member, `app/layouts/app.vue`) are the ones left in the header on a phone after TASK-037.

## Implementation requirements

- Below 768px every interactive element in the header (`.nav-link`, the "Sair" button, the logo link) has a hit box ≥ 44 × 44px (padding, not bigger text). Desktop spacing unchanged.
- The bottom nav from TASK-037 stays as it is.
- The header must still fit in 320px without horizontal scroll.

## Explicitly excluded

- `HeaderSearch.vue` (its trigger is already 44px). Nav items or copy.

## Expected files

```
app/layouts/default.vue
app/layouts/app.vue
```

## Acceptance criteria

- [ ] At 375px each header link/button has `getBoundingClientRect().height` ≥ 44 (reviewer checks in the browser)
- [ ] At 320px, `scrollWidth === clientWidth` on `/` and `/@<handle>`
- [ ] `git diff` touches only styles in the two layouts (no template changes except classes)

## Definition of done

- [ ] `npm run lint`, `npm run typecheck`, `npm run test` pass (run by the reviewer, not the agent)
