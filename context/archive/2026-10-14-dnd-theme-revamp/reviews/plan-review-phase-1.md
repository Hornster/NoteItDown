<!-- PLAN-REVIEW-REPORT -->
# Plan Review: D&D Theme Revamp — Phase 1 (Baseline evidence)

- **Plan**: context/changes/dnd-theme-revamp/plan.md
- **Scope**: Phase 1 only
- **Mode**: Deep (inline verification, no sub-agent: Phase 1 touches 4 files)
- **Date**: 2026-10-14
- **Verdict**: SOUND (all 3 findings fixed in triage)
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding
Grounding: 6/6 paths ✓ (playwright.config.ts, package.json, .gitignore, tests/e2e/notes-relations.spec.ts, tests/e2e/support/hydration.ts, tests/e2e/auth-session.spec.ts), 5/5 symbols ✓ (testMatch, deleteNoteViaUi, waitForHydration, Radix cancelRef autofocus at index.mjs:58-60, AlertDialogCancel in DeleteNoteButton.tsx:51), brief↔plan ✓. `/dashboard` is a redirect endpoint (src/pages/dashboard.ts) to /campaigns/[id], so the `dashboard` shot captures the campaign index page. All 12 page routes exist.

## Findings

### F1 — Shared state across "one test per shot" is undecided

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 §2 — Theme screenshot script
- **Detail**: The plan wants each of the 16 shots to be its own `test`, but 11 of them need one shared signed-in user, campaign, two related notes and an uploaded image. Playwright gives each test a fresh context, and nothing in the plan covers seeding once, reusing the session, or test order. Two shots depend on transient state: `note-saved-notice` (a one-shot sessionStorage notice, consumed on render: RelationChangeNotice.tsx:49) and the open dialog/popup. A naive implementation either signs in per test (~11 auth calls; tests/support/test-user.ts says "once per test file (in beforeAll)", 50 sign_in_sign_ups per 5 min, shared with an e2e run started just before) or chains tests with hidden ordering.
- **Fix**: Specify the setup. In `beforeAll`: `createTestUser()` (no UI signup needed), seed the second note and relation through the UI or API, sign in once through the UI in a context and save `storageState`. Signed-in tests use `test.use({ storageState })`. `note-saved-notice` performs its own edit and shoots right after the redirect. `delete-dialog` and `image-popup` open their overlay inside the test. Run in default (parallel-safe) order, so no test depends on another.
  - Strength: Each shot stays independent, as the plan intends; 2 auth calls total; reuses the helper documented for this purpose.
  - Tradeoff: Seeding the image still needs the UI form (file input `#images`, `setInputFiles`), because no seed API for images exists in tests/support.
  - Confidence: HIGH — the storageState pattern is standard Playwright, and createTestUser is already used by notes-relations.spec.ts.
  - Blind spot: Whether `compress.ts` accepts a tiny generated PNG is unverified (use something like 64×64).
- **Decision**: FIXED (Fix in plan: beforeAll createTestUser + one UI sign-in saved to storageState; independent tests)

### F2 — Shot determinism and the `header-footer` shot are underspecified

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §2 — Theme screenshot script
- **Detail**: "After `fitView` settles" has no wait condition. `header-footer` is one file, but the plan says "viewport shot, top and bottom of dashboard", which is two positions. Before/after pairs come from different runs, so animations and caret blink add noise to the comparison.
- **Fix**: Map shot waits for 2 `.react-flow__node` elements and 1 `.react-flow__edge` element to be visible. All shots pass `animations: "disabled", caret: "hide"`. Split into `header` and `footer` viewport shots (the count becomes 17), or make `header-footer` a full-page shot of the campaign page.
- **Decision**: FIXED (Fix in plan: node/edge waits, animations/caret off, header + footer shots, count 16 → 17)

### F3 — Criterion 1.3 has no runnable command

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 Success Criteria (Progress 1.3)
- **Detail**: "list output shows only `chromium` tests" names no command to run.
- **Fix**: `npm run test:e2e -- --list | grep -c "\[screenshots\]"` returns 0, and `npm run test:screenshots -- --list` lists the 16 shots.
- **Decision**: FIXED (Fix in plan: --list grep command on 1.3)
