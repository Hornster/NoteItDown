<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Constants Sweep (S-04), Phase 1 (Dictionaries + server-side sweep)

- **Plan**: context/changes/constants-sweep/plan.md
- **Scope**: Phase 1 only (plan-wide internal consistency scan included)
- **Mode**: Deep (claims verified inline against the code; no sub-agent)
- **Date**: 2026-10-13
- **Verdict**: REVISE → SOUND after triage
- **Findings**: 1 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | FAIL |

## Grounding
Grounding: 13/13 paths ✓, 6/6 symbols ✓ (`jsonError`, `HTTP_STATUS`, `PG_ERROR`, `FOOTER_LICENSES_LINK` @ Layout.astro:40, `NOT_FOUND` @ notes/[noteId].ts:14, SQLSTATE sites 12/12), status literal count 40 + 9 = 49 ✓, Progress↔Phase 1 ✓, brief↔plan ✓

## Findings

### F1 — Criterion 1.7 grep cannot pass after Phase 1

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Success Criteria, automated bullet 7 (Progress 1.7)
- **Detail**: The grep scans all of `src/pages`, so it also matches the 7 not-found `<p>` lines in `.astro` pages (`campaigns/[campaignId]/{index,map,edit}.astro`, `notes/new.astro`, `notes/[noteId].astro`, `notes/[noteId]/edit.astro`: "doesn't exist or isn't yours"). Those are Phase 2 scope ("not-found `<p>`s use … `CAMPAIGN_NOT_FOUND` and `NOTE_NOT_FOUND`"). After a correct Phase 1 the grep still prints 7 lines, so the gate either fails or pulls Phase 2 work forward.
- **Fix**: Add `--include=*.ts` to the 1.7 grep (Phase 2's 2.6 already covers the `.astro` side).
- **Decision**: FIXED — `--include=*.ts` added to 1.7 (now 1.8). Correction during triage: Phase 2's 2.6 did not cover "doesn't exist or isn't yours", so that term was added to the 2.6 grep too.

### F2 — `HttpStatus` narrowing doesn't catch leftover literals; Phase 1 has no status check

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 §1 (Intent: "make the type system reject bare numbers passed to `jsonError`") and Phase 1 Success Criteria
- **Detail**: `HttpStatus` is the union `200 | 201 | 400 | … | 500`, so `jsonError(body, 404)` still type-checks. The type only rejects values outside the dictionary and `number`-typed variables. Nothing in Phase 1 proves the 49 status literals (40 in API routes, 9 in redirect endpoints) were converted: 1.1 passes with literals left, the ESLint rule arrives only in Phase 4, and the greps cover SQLSTATEs and messages only. A missed `status: 201` would surface 3 phases later.
- **Fix**: Correct the Intent ("rejects statuses outside the dictionary; literal enforcement is Phase 4's ESLint rule") and add an automated criterion: `grep -rnE '\b[1-5][0-9]{2}\b' src/pages/api/campaigns src/pages/dashboard.ts src/pages/map.ts src/pages/campaigns/index.ts src/pages/notes | grep -v '/images'` prints nothing (verified today: exactly 49 hits, all statuses). Add the matching Progress item.
  - Strength: Closes the gap with a check already proven against the current tree; no tooling change.
  - Tradeoff: One more grep to keep in sync with the file list.
  - Confidence: HIGH — grep run on the current tree returns the 49 known sites and nothing else.
  - Blind spot: None significant.
- **Decision**: FIXED — §1 Intent corrected; status-literal grep added as criterion/Progress 1.7; messages grep is now 1.8, manual spot-check 1.9.

### F3 — No automated oracle for message byte-identity

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 §2, §3, §6 and Success Criteria
- **Detail**: The brief names "a moved message differs by one character; nothing pins API texts" as Phase 1's key risk, and the plan adds no check for it. `schemas/{campaigns,notes}.test.ts` assert only `result.success`, no file in `tests/` asserts any API message text, and manual 1.8 covers 2 of ~17 moved messages. §6's fallback ("if one asserts a message literal, it keeps the literal") never applies, since none do.
- **Fix**: Before moving anything, add literal `issues[0].message` assertions to the existing reject cases in `schemas/campaigns.test.ts` and `schemas/notes.test.ts` (empty name, name too long, content too long, invalid type id, empty and too-long type name). Then do the move; the tests must stay green unedited.
  - Strength: Pins all 7 validation texts (the ones Phase 2's forms will share) with tests that already exist; costs about 7 lines.
  - Tradeoff: Route-only texts (`campaignNameTaken`, `*_FAILED`, `NO_CAMPAIGN_FOR_ACCOUNT`) are still covered only by review and the manual spot-check.
  - Confidence: HIGH — the tests already reach every rejecting branch.
  - Blind spot: Route bodies stay unpinned; acceptable because they are table-driven copies of today's literals.
- **Decision**: FIXED — §6 now starts with a step that pins the 7 validation texts as literal `issues[0].message` assertions before the move; Testing Strategy updated.

### F4 — Phase 1 key-scope sentence contradicts its table

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §2 Intent
- **Detail**: The sentence says "Phase 1 adds only what phases 1 and 3 need on the server". But the phase 3 keys (`AUTH_*`) are added in phase 3, `EMAIL_REQUIRED`/`PASSWORD_REQUIRED` in phase 2, and the table includes `CAMPAIGN_SAVE_FAILED`, which is used only by the client hook `useSaveCampaign.ts:4`. The `FOOTER_LICENSES_LINK` → `LICENSES_LABEL` rename also touches `Layout.astro`, a UI file.
- **Fix**: Reword to "Phase 1 adds the server and validation keys below (`CAMPAIGN_SAVE_FAILED` is included for phase 2's hook); phase 3 adds its own auth keys."
- **Decision**: FIXED — §2 Intent reworded.
