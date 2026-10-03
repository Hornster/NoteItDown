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
- **Rule**: In new code use `HTTP_STATUS` (`src/lib/http-status.ts`), `PG_ERROR` (`src/lib/db-error-codes.ts`) and `MESSAGES` (`src/lib/messages.ts`) instead of literals. Add missing entries to the dictionaries; do not introduce new inline literals.
- **Applies to**: plan, implement, impl-review
