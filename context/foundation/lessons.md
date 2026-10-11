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
