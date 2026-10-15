# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Check for a running dev server before testing

- **Context**: implementation phase
- **Problem**: Not working web pages, failures to load js by browser, mismatches between what is in the tested code and what is the server showing. Makes testing harder and takes more time.
- **Rule**: Always before testing during implementation phases verify if the astro dev server is already running. If yes, inform the user and ask if you or the user can shut it down.
- **Applies to**: implement, impl-review

## Waived criteria are annotated, not ticked

- **Context**: context/changes/multi-campaign-support/plan.md:414 (Progress 3.13), context/foundation/roadmap.md:172
- **Problem**: The implementation commit parked mobile support in the roadmap ("phone-width checks are not MVP acceptance criteria"), yet manual criterion 3.13 (phone width) was ticked `[x]` with no note. A later reader can't tell whether the criterion was verified or waived.
- **Rule**: When a scope decision waives a plan success criterion, mark it with a note like `(waived: <reason>, <where decided>)` instead of a bare `[x]`.
- **Applies to**: implement, impl-review, plan

## Use the central error/status/message dictionaries in new code

- **Context**: context/foundation/roadmap.md Observations (scattered numeric status codes, SQLSTATE strings and message literals)
- **Problem**: HTTP statuses, Postgres error codes and user-facing strings are repeated as literals across routes and services, so renames and wording changes drift.
- **Rule**: In new code use `HTTP_STATUS` (`src/lib/constants/http-status.ts`), `PG_ERROR` (`src/lib/constants/db-error-codes.ts`), `DB_CONSTRAINT` (`src/lib/constants/db-constraints.ts`) and `MESSAGES` (`src/lib/constants/messages.ts`) instead of literals. Add missing entries to the dictionaries; do not introduce new inline literals.
- **Applies to**: plan, implement, impl-review

## Extract island fetch/state logic into hooks

- **Context**: Any React island in src/components/ that fetches or holds async state
- **Problem**: Components possess inline logic instead of dealing with render
- **Rule**: Extract fetch/state logic of React islands into hooks in src/components/hooks/
- **Applies to**: implement

## Always save the plan-review report, one file per reviewed phase

- **Context**: Any /10x-plan-review run, including phase-scoped reviews. Seen in context/changes/auth-risk-tests: the Phase 1 and Phase 2 reviews were triaged without a saved report.
- **Problem**: Choosing 'Triage findings' skips the save step. The only record of the findings, fix options and decisions is a one-line note in change.md, so the reasoning behind each plan edit is lost to later impl-review and to readers.
- **Rule**: Always save the plan-review report, even when triaging right away. Full reviews shall be written into reviews/plan-review.md. Phase-by-phase reviews shall be written into reviews/plan-review-<phase>.md files, one file per phase.
- **Applies to**: plan-review, impl-review

## Probe double-slash path variants with a deeper path

- **Context**: HTTP route-guard tests that probe path variants
- **Problem**: Tests that expect either 302 or 401 (verification against unauthorized access so either redirect or unauthorized response) face a sudden 200 because of internal treatment of such routes by Astro.
- **Rule**: Path-variant probes (such as double-slashed paths) should use a deeper path. I.e. //campaigns/<uuid>
- **Applies to**: plan, plan-review, implement, impl-review

## Run HTTP-level checks against the production preview, not `astro dev`

- **Context**: context/changes/auth-risk-tests Phase 4 — smoke's "edit-note API 404s a malformed note id" step returned 500 under `npx astro dev` but passed against `npm run preview` and in CI. Full explanation: `TESTING.md` → "Known issue: `astro dev` fails the request after an unread request body".
- **Problem**: Under `astro dev`, the Cloudflare dev proxy (`@cloudflare/vite-plugin` → miniflare → undici) fails the request that follows any response sent without reading the request body. A 500 seen only in dev looks like an app bug and costs debugging time.
- **Rule**: Run smoke, `test:http` and e2e against the production preview (`npm run build && npm run preview`). Before treating a 500 from `astro dev` as an app bug, reproduce it against the preview; if it only happens in dev right after a rejected request with a body, it is this known issue.
- **Applies to**: implement, impl-review

## Weaken both notes SELECT and UPDATE policies when break-testing RLS

- **Context**: RLS, database policies testing
- **Problem**: Loosening only one policy (either notes_select_own_campaign or notes_update_own_campaign) will not catch access violation of user B to user A's notes.
- **Rule**: Whenever testing RLS access control over notes between users make sure to weaken both notes_select_own_campaign and notes_update_own_campaign policies.
- **Applies to**: plan, plan-review, implement, impl-review

## Use the central dictionaries in all code, not only new code

- **Context**: context/changes/constants-sweep. Supersedes "Use the central error/status/message dictionaries in new code": the sweep moved existing routes, services, UI and tests onto the dictionaries.
- **Problem**: Numeric statuses, SQLSTATEs and message literals creep back in when the rule only covers new code. Over-extracting every string into `MESSAGES` is the opposite failure.
- **Rule**: Use `HTTP_STATUS`, `PG_ERROR`, `DB_CONSTRAINT` and `MESSAGES` (all in `src/lib/constants/`) everywhere, including tests for statuses and SQLSTATEs. Duplication boundary: any error, validation, notice or response-body message is always a key, even if used once; any other UI string (label, title, h1, link, button, aria-label, placeholder) becomes a key when its exact text appears 2+ times in `src/` (repeats within one file count; an interpolated string counts by its rendered template and gets a helper); strings used once, `src/components/ui/` and starter copy stay inline. Naming: SCREAMING_SNAKE_CASE keys, helper functions for interpolated texts, `_LABEL` suffix for labels, `_TITLE` for page-title fallbacks. Enforcement: `jsonError` takes `HttpStatus`, and the ESLint `no-restricted-syntax` block in `eslint.config.js` rejects numeric status literals in `src/` (the per-edit hook reports it). Known gap: a status in `switch (res.status) { case 404: }` is not caught, so review covers it. e2e and http oracles of expected message text (e.g. `UI_BASELINE`, `?error=` text) stay literal and never import `MESSAGES`, so a wording change fails them on purpose.
- **Applies to**: plan, implement, impl-review

## Colors only through semantic tokens and UI primitives

- **Context**: Any UI work in src/ (.astro, .tsx, .css). Seen in context/changes/dnd-theme-revamp (S-05).
- **Problem**: 289 hard-coded Tailwind palette classes in 34 files plus hex/rgba literals became the real theme; retheming meant touching every page and the tokens were ignored.
- **Rule**: Never use Tailwind palette color classes, arbitrary color classes or hex/rgb literals in src/; use semantic tokens and the variants in src/components/ui/ (buttonVariants, cardVariants, badgeVariants, alertVariants). Token values only in `src/styles/global.css`; nested panels inside a card use `border border-input bg-background`; in .astro use `class:list={cn(...)}`. Enforced by `src/styles/theme-guard.test.ts`.
- **Applies to**: plan, implement, impl-review
