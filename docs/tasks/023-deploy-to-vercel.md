# TASK-023 — Deploy to Vercel

## Goal

Get the app live on Vercel, in São Paulo, with production environment variables.

## Context

Last step before inviting anyone. Two configuration details are easy to get wrong and expensive to discover later: the function region, and which database preview deployments point at.

## Scope

### Included

- Vercel project connected to the repository
- Production environment variables
- `regions: ["gru1"]` verified
- Preview deployments pointing at a Neon branch
- End-to-end verification on a real phone

### Explicitly excluded

- A custom domain (deferred — see [open-questions.md](../open-questions.md))
- A staging environment
- CI-run migrations

## Dependencies

- TASK-014, TASK-016, TASK-019

## Expected files/components

```
nuxt.config.ts   (region confirmed)
(Vercel dashboard configuration)
```

## Implementation requirements

1. Connect the repository. Framework auto-detects as Nuxt; Nitro emits the Vercel build output with no configuration.
2. **Verify `regions: ["gru1"]` is present in the deployed function configuration**, not merely in the config file. São Paulo — the wrong region adds roughly 200ms to every query.
3. Production env vars: `DATABASE_URL` (pooled), `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `EMAIL_FROM`, `GMAIL_APP_PASSWORD`. **There is no `RESEND_API_KEY`** — delivery moved to Gmail SMTP in TASK-007 ([architecture.md](../architecture.md) §3.5). Omitting `GMAIL_APP_PASSWORD` does not fail the build; it fails the first sign-in, because the transport is built lazily.
4. **`DATABASE_URL_DIRECT` must NOT be set on Vercel.** It is for laptop migrations and `pg_dump` only.
5. **Preview deployments must point at a Neon branch, not production.** Set `DATABASE_URL` separately for the Preview environment. Getting this wrong means a preview deploy writing to real data.
6. `NODE_ENV=production`; confirm Nuxt dev-mode error overlays are unreachable.
7. Deploy on push to `main`.
8. Verify the CSP header from [security.md](../security.md) §2 is present on responses.
9. Run the migration against production **before** deploying the code that needs it.

## Data/API changes

None.

## UX requirements

The production site must be fully usable on a phone, including inside WhatsApp's in-app browser.

## Security requirements

- No secret in `runtimeConfig.public`. **Grep the built client bundle to prove it.**
- `DATABASE_URL_DIRECT` absent from Vercel.
- Preview deployments isolated from production data.
- HTTPS enforced (automatic).
- Session cookies `Secure` in production.
- Error responses contain no stack traces.

## Testing requirements

Full end-to-end on the deployed site:

- Sign in with a real email on a real Android phone, **from inside WhatsApp's in-app browser**.
- Search for a book, log it, view the permalink.
- Paste that permalink into a real WhatsApp chat and observe the preview on Android and iOS.
- Confirm the 86 migrated books render on the owner's profile.
- Confirm a privado entry is invisible to a second account.

## Acceptance criteria

- [ ] The production URL serves the site over HTTPS
- [ ] The deployed function region is `gru1`
- [ ] `DATABASE_URL_DIRECT` is not set in the Vercel environment
- [ ] Preview deployments write to a Neon branch, not production (verified by writing in a preview and confirming production is unchanged)
- [ ] Grepping the built client bundle finds no secret values
- [ ] The CSP header is present on production responses
- [ ] **Sign-in completes on a real Android phone inside WhatsApp's in-app browser**
- [ ] A book can be searched, logged and viewed on the deployed site
- [ ] **A permalink pasted into WhatsApp previews with cover, title and review snippet on Android and iOS**
- [ ] The owner's profile shows all 86 migrated books
- [ ] A privado entry returns 404 to a second account
- [ ] A forced 500 shows no stack trace

## Definition of done

- [ ] Implementation complete
- [ ] `npm run test` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] No unrelated regressions
- [ ] Documentation updated where appropriate

## Notes / implementation guidance

The preview-database check is worth doing properly: create a preview deployment, write a record through it, and confirm it did not appear in production. A misconfigured preview environment silently corrupting real data is the kind of mistake that is discovered weeks later.

Vercel Hobby is **non-commercial use only**. This project qualifies. If it is ever monetised, Vercel Pro becomes mandatory.
