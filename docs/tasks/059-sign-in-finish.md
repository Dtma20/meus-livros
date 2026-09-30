# TASK-059 - Sign-in finish

## Context

Visual-audit round of 2026-09-28. Findings and measurements: [visual-audit-2026-09-28.md](../reports/visual-audit-2026-09-28.md). Agent prompt: [PROMPT-frontend-melhorias.md](../agent-prompts/PROMPT-frontend-melhorias.md). Tokens `--danger-text`, `--success`, `--highlight-soft`, `--highlight-glow` and `color-scheme: dark` are already in `tokens.css` (commit 2b4ec2f) - use them, do not edit `tokens.css`. Tasks 049-059 run in parallel; touch only the files listed below.

`/entrar`: the submit is `disabled` until both fields have text (`app/pages/entrar/index.vue:62`), rendered at opacity .5, so the primary action looks broken on first sight. The identifier placeholder "seu-email@exemplo.com ou…" is truncated at 375. The two help links wrap to two lines each at 375.

## Implementation requirements

1. The submit is disabled only while `loading`. On submit with an empty field, show the existing pt-BR message (`E-mail, usuário ou senha incorretos.` is wrong for this case: use `Preencha e-mail ou usuário e senha.`) and make no request.
2. Identifier placeholder: `e-mail ou usuário`.
3. Below 400px the help links stack vertically, each on one line, each ≥ 44px tall; the separator dot is hidden.

## Explicitly excluded

- The auth flow, rate limiting, other auth pages.

## Expected files

```
app/pages/entrar/index.vue
tests/unit/ (one new test for requirement 1)
```

## Acceptance criteria

- [ ] Submit enabled on load
- [ ] Unit test: submitting empty fields shows the message and does not call `$fetch`
- [ ] At 375 each help link renders on one line

## Definition of done

- [ ] `npm run lint`, `npm run typecheck`, `npm run test` pass (run by the reviewer, not the agent)
