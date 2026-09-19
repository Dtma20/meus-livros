# TASK-001 — Scaffold the Nuxt 4 project

## Goal

Stand up a Nuxt 4 + TypeScript project in this repository without breaking the existing static site.

## Context

The repository is currently five files with no build step. Everything downstream needs a working Nuxt app with strict TypeScript, linting and a test runner. The existing site must keep running until the new app reaches parity — see [migration.md](../migration.md) §9.

## Scope

### Included

- `npm init` + `nuxt@^4` with TypeScript
- `tsconfig` with `strict: true`
- ESLint with two custom rules (see below)
- Vitest
- `.env.example`, `.gitignore`
- Move `index.html`, `styles.css`, `livros.json`, `generos.txt`, `livros_lidos_atualizado.csv` into `legacy/`
- npm scripts per [infrastructure.md](../infrastructure.md) §1

### Explicitly excluded

- Any database work
- Any page beyond the default index
- Deleting any legacy file
- Porting components (that is TASK-005)

## Dependencies

None. This is the first task.

## Expected files/components

```
package.json  nuxt.config.ts  tsconfig.json  eslint.config.mjs
vitest.config.ts  .env.example  .gitignore
app/app.vue
legacy/{index.html,styles.css,livros.json,generos.txt,livros_lidos_atualizado.csv}
```

## Implementation requirements

1. Nuxt 4 with `typescript.strict: true` and `typescript.typeCheck: true`.
2. `nuxt.config.ts` sets `nitro: { preset: 'vercel' }` and `vercel: { regions: ['gru1'] }` (São Paulo — a wrong region adds ~200ms per query).
3. ESLint config includes **two non-negotiable rules**:
   - `vue/no-v-html: 'error'` — reviews are plain text, see [security.md](../security.md) §1
   - `no-restricted-imports` forbidding `~/server/db` outside `server/services/**`
4. Scripts: `dev`, `build`, `typecheck`, `lint`, `test`.
5. `.gitignore` covers `.env`, `.nuxt`, `.output`, `node_modules`.
6. `.env.example` lists every variable from [infrastructure.md](../infrastructure.md) §2 with placeholder values only.
7. Move legacy files with `git mv` so history is preserved.
8. Add a `legacy/README.md` explaining that the folder is the pre-Nuxt site, still runnable with `python -m http.server`, kept until parity.

## Data/API changes

None.

## UX requirements

None — no user-facing surface yet. The default page may be a placeholder.

## Security requirements

- `.env` must be gitignored before any secret is ever written to it.
- `.env.example` contains no real values.

## Testing requirements

- One trivial Vitest test proving the runner works (`expect(1+1).toBe(2)` is acceptable here and only here).
- Verify the ESLint rules actually fire: temporarily add a `v-html` usage, confirm `npm run lint` fails, remove it.

## Acceptance criteria

- [x] `npm run dev` serves a page at `http://localhost:3000` with HTTP 200
- [x] `npm run typecheck` exits 0
- [x] `npm run lint` exits 0
- [x] `npm run test` exits 0
- [x] `npm run build` exits 0 and produces `.vercel/output/` (the `vercel` preset writes there, not to `.output/`)
- [x] A file containing `v-html` causes `npm run lint` to exit non-zero
- [x] A file in `app/` importing `~/server/db` causes `npm run lint` to exit non-zero
- [x] `legacy/index.html` still renders the 86-book grid when served over HTTP
- [x] `git log --follow legacy/index.html` shows the pre-move history (verifiable only after the move is committed)
- [x] `git status` shows no `.env` file tracked

## Definition of done

- [x] Implementation complete
- [x] `npm run test` passes
- [x] `npm run typecheck` passes
- [x] `npm run lint` passes
- [x] No unrelated regressions
- [x] Documentation updated where appropriate

## Notes / implementation guidance

Do not install Tailwind, a component library, Pinia, or an icon set. TASK-005 ports the existing CSS tokens; nothing here needs a styling system.

**Resolved against Nitro 2.13.4:** the region goes in `nitro.vercel.functions.regions`. A top-level `nitro.vercel.regions` is read only by the `vercel-edge` preset (`nitropack/dist/presets/vercel/utils.mjs`) and is silently ignored by `vercel`. Verify after building: `.vercel/output/functions/__fallback.func/.vc-config.json` must contain `"regions": ["gru1"]`.
