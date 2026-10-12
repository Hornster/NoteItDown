<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Notes, Relations & Isolation Risk Tests — Phase 3 (E2E — forged URL, note CRUD with pinned notice, map click)

- **Plan**: context/changes/notes-relations-risk-tests/plan.md
- **Scope**: Phase 3 only
- **Mode**: Deep (claims verified inline against the notice component, save/delete hooks, relation-detection SQL, map island and the Playwright harness)
- **Date**: 2026-10-12
- **Verdict**: REVISE → SOUND after triage
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

6/6 paths ✓ (`RelationChangeNotice.tsx`, `useSaveNote.ts`, `map.astro`, `tests/e2e/auth-session.spec.ts`, `tests/e2e/support/hydration.ts`, `playwright.config.ts`), 6/6 symbols ✓ (`role="status"` is the only one in `src/`, notice copy at `RelationChangeNotice.tsx:63-80`, `rechecked` = name/content changed, `onNodeClick` → `/campaigns/{cid}/notes/{id}` at `MemoryMap.tsx:71-72`, `client:only="react"` at `map.astro:65`, delete redirects to `/campaigns/{cid}` where the delete-target notice is mounted at `index.astro:65`), brief↔plan ✓, Progress↔Phase 3 ✓ (3.1–3.5), contract surfaces `notes`, `relations`, Relation detection, Session storage touched read-only.

## Findings

### F1 — Auth budget "≤ 5" is unreachable with one Playwright test per scenario

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 3 §1 (CRUD scenarios) and §2 (map, auth-call total)
- **Detail**: Playwright gives every `test()` a fresh browser context, so each test needs its own UI sign-in (1 auth call). The plan lists 8 CRUD scenarios on "one seeded user, signed in through the UI" without saying they run in one test or share a page; as 8 tests that is 1 (`createTestUser`) + 8 sign-ins = 9 calls. Forged URL costs 3 (A + B `createTestUser` + B sign-in). CRUD as one test (2) + forged (3) already equals the 5 cap, so the map scenario fits only if it reuses an already signed-in page; with its own user it adds 2 → 7. The plan doesn't say which user the map uses. Performance section ("the CRUD scenario reuses one user across steps") hints at the intent but the contract doesn't pin it.
- **Fix**: Pin the structure: CRUD runs as one `test()` with a `test.step` per scenario (one `createTestUser` + one UI sign-in); the map scenario is a final step of that same test, run on two notes still related at that point (before the delete steps or on a dedicated pair); forged URL is its own test (3 calls). State the total (5) in the spec comment.
  - Strength: Meets the stated budget exactly; failures still name the step via `test.step`; matches `auth-session.spec.ts` comment style.
  - Tradeoff: One long test — an early step failure skips the later wording checks in that run.
  - Confidence: HIGH — fresh context per test is Playwright's default; budget arithmetic follows from `createTestUser` = 1 signUp call (`tests/support/test-user.ts:32`).
  - Blind spot: None significant (alternative `describe.serial` + `browser.newPage()` in `beforeAll` is equivalent).
- **Decision**: FIXED — CRUD + map as one `test()` with `test.step`s, forged URL separate, total 5 stated; §2 file now `notes-relations.spec.ts`

### F2 — No fixture design for names/contents; relation matching makes it easy to get wrong

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3 §1 (scenarios), `UI_BASELINE` builders
- **Detail**: Relation detection is bidirectional, case-insensitive and word-bounded (`note_mentions` + `detect_note_relations`, `20260926120000_relation_detection.sql:10-60`). The "edit removing it" step only yields a removed line if the target note's content does not mention the edited note's name; a name that is a word inside another name or inside any content (e.g. "Orc" vs "Orc King") creates extra relations and extra names in the line. Multi-name lines are ordered by `lower(name), id` (`20260930120000_note_edit_delete_functions.sql`), which `relationsAdded(names)` must reproduce. The scenarios also chain state (later steps depend on relations left by earlier ones), but the plan gives no per-step expected relation state.
- **Fix**: Add a small fixture table to §1: distinct non-overlapping note names (e.g. `Zephyr Harbor`, `Quillmoor`, `Brasswick`), which note's content mentions which at each step, the expected added/removed names per step, and a note that builders receive names in `lower(name)` order.
- **Decision**: FIXED — fixture table (4 non-overlapping names, per-step content, expected lines and relation state), `lower(name)` ordering note and alertdialog-scoped delete confirm added to Phase 3 §1

### F3 — Manual 3.4 can silently test a stale preview

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 Manual Verification (3.4)
- **Detail**: E2E runs against the production preview, and locally `reuseExistingServer` is true (`playwright.config.ts`). Changing the notice phrase in `src/` without `npm run build` and restarting any preview already on 4322 leaves the old copy served, so the "should fail" check passes and looks like the pin is broken. Same applies to the revert.
- **Fix**: Amend 3.4: "edit the phrase, stop any preview on 4322, `npm run build && npm run test:e2e` → fails; revert, rebuild, rerun → green."
- **Decision**: FIXED — 3.4 now requires stopping any preview on 4322 and rebuilding before and after the temporary edit
