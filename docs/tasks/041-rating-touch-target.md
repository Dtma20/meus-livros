# TASK-041 - Half-star target wide enough to hit on a phone

## Context

Frontend round of 2026-09-27. Agent prompt: [PROMPT-frontend-melhorias.md](../PROMPT-frontend-melhorias.md). Runs in parallel with the other tasks 039-048; touch only the files listed below.

`app/components/book/RatingInput.vue` splits each 28px star into two halves (`.star-half { width: 50% }`), so a half-star is **14px wide** - under WCAG 2.5.8's 24px floor, on the most-used input of the product. The component is `role="slider"` on purpose (TASK-021): keep it.

## Implementation requirements

- On touch screens (`@media (hover: none)`), each star is at least 48px wide so each half is ≥ 24px, and the control height is ≥ 44px. The five stars must still fit in 343px (the content width at 375px) without wrapping or horizontal scroll - reduce the gap if needed.
- Desktop size unchanged.
- `role="slider"`, `aria-valuemin/max/now/valuetext`, keyboard handling, hover preview and the "Limpar" button unchanged.

## Explicitly excluded

- Converting to radiogroup. Any change to rating values or emits. `StarRating.vue`.

## Expected files

```
app/components/book/RatingInput.vue
tests/unit/rating-input.test.ts   (new or existing)
```

## Acceptance criteria

- [ ] Under `(hover: none)` the CSS gives each half-star ≥ 24px width (assert in the test through the computed rule or a class; state in the report how it was checked)
- [ ] `grep -n 'role="slider"' app/components/book/RatingInput.vue` still matches
- [ ] 5 × star width + 4 × gap ≤ 343px on touch
- [ ] Arrow keys still change the value by 0.5 (existing test, or add one)

## Definition of done

- [ ] `npm run lint`, `npm run typecheck`, `npm run test` pass (run by the reviewer, not the agent)
