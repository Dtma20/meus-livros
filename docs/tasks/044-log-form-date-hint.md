# TASK-044 - The date hint only says what is true

## Context

Frontend round of 2026-09-27. Agent prompt: [PROMPT-frontend-melhorias.md](../PROMPT-frontend-melhorias.md). Runs in parallel with the other tasks 039-048; touch only the files listed below.

`app/components/log/LogForm.vue:79` always prints "Preenchida com a data de hoje pelo seu navegador." under "Data de término". On the edit screen the field holds the stored date (e.g. 2024-01-01), so the form states something false about its own data (`docs/frontend-audit.md`, P2).

## Implementation requirements

- Show the hint only in `mode === 'create'` **and** while the value still equals the browser-local today that the form filled in. Once the user changes the date, or in edit mode, the hint disappears.
- Remove `aria-describedby` from the input whenever the hint is not rendered (never point at a missing id).
- Nothing else in the form changes.

## Explicitly excluded

- Date defaults, precision selector, draft logic, submit.

## Expected files

```
app/components/log/LogForm.vue
tests/unit/log-form.test.ts
```

## Acceptance criteria

- [ ] Create mode, untouched → hint visible, input `aria-describedby="log-finished-hint"`
- [ ] Create mode after changing the date → hint gone, no `aria-describedby`
- [ ] Edit mode → hint never rendered
- [ ] `git diff --stat` shows only the two files above

## Definition of done

- [ ] `npm run lint`, `npm run typecheck`, `npm run test` pass (run by the reviewer, not the agent)
