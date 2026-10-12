<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Notes, Relations & Isolation Risk Tests — Phase 4 (Docs and scenario register)

- **Plan**: context/changes/notes-relations-risk-tests/plan.md
- **Scope**: Phase 4 only
- **Mode**: Deep (claims verified inline against test-plan.md, TESTING.md, CLAUDE.md, research.md, ci.yml and a live `prettier --check`)
- **Date**: 2026-10-12
- **Verdict**: REVISE → SOUND after triage
- **Findings**: 0 critical, 3 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

5/5 paths ✓ (test-plan.md, TESTING.md, CLAUDE.md, research.md, ci.yml), §6.2/6.4/6.5/6.6 headings ✓, research ids 29/29 ✓ (1.1–1.15, 3.1–3.4, 5.1–5.5, C.1–C.3, M.1–M.2), brief↔plan ✓, Progress↔Phase 4 ✓ (4.1–4.4).

## Findings

### F1 — Prettier check fails before Phase 4 starts

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 4 — Success Criteria 4.1
- **Detail**: `npx prettier --check context/foundation/test-plan.md TESTING.md CLAUDE.md` fails on the current tree: test-plan.md would get ~85 changed lines (table padding in §2, `*emph*` → `_emph_`), CLAUDE.md 6 (blank lines, missing final newline). 4.1 is red before any Phase 4 edit, and lint-staged's `prettier --write` on `*.md` would mix the reformat into the register diff at commit time.
- **Fix**: Add a Phase 4 first step: `npx prettier --write` on the three files as a separate formatting-only commit, then the content edits.
  - Strength: 4.1 becomes reachable; the register/cookbook diff stays reviewable.
  - Tradeoff: One extra commit touching unrelated CLAUDE.md lines.
  - Confidence: HIGH — check run, diff observed.
  - Blind spot: Whether the user wants CLAUDE.md reformatted on this branch.
- **Decision**: FIXED — Phase 4 §0 added: `prettier --write` on the three files as a formatting-only first commit

### F2 — Rate-cap doc update points at files that don't contain "30"

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4 §1 / §2
- **Detail**: §2 targets "30 / 5 min" in TESTING.md and CLAUDE.md — neither contains it. The only stale mention after Phase 1 is `test-plan.md:137` (§6.3), which §1's contract does not list.
- **Fix**: Add "§6.3: rate-limit sentence 30 → 50" to §1's contract; narrow §2 to the suite-coverage lines (CLAUDE.md `test:http` description, TESTING.md:17); add check `grep -n "30 / 5 min" context/foundation/test-plan.md` → no hits.
- **Decision**: FIXED — §6.3 rate sentence moved into §1; §2 narrowed to coverage lines; new automated check 4.3 (`grep "30 / 5 min"`)

### F3 — The 4.2 grep misses the §6.4 TBD marker

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4 — Success Criteria 4.2
- **Detail**: `grep "TBD — see §3 Phase 2"` matches :131 and :155 only; §6.4 reads "see §3 Phase 2 (TBD)" at :151, so it could stay unfilled while 4.2 passes.
- **Fix**: Use `grep -nE "TBD — see §3 Phase 2|Phase 2 \(TBD\)" context/foundation/test-plan.md` → no hits (plan + Progress 4.2).
- **Decision**: FIXED — 4.2 grep widened to `TBD — see §3 Phase 2|Phase 2 \(TBD\)` (plan + Progress)

### F4 — "§4 Stack / §8 ledger dates as touched" is vague

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4 §1, last bullet
- **Detail**: §3 Phase 2 row "Test types" omits http; §4 test-base profile describes http as anonymous route-guard and e2e as auth-only; §8 "Strategy last reviewed" is 2026-10-11. All become stale after S-02.
- **Fix**: Name the edits: §3 row Test types += "http forged-ID"; §4 profile sentence += forged-ID matrix and UI CRUD/map e2e; §8 Strategy date = landing date.
- **Decision**: FIXED — §1 now names the §3 Test types, §4 profile/http row and §8 Strategy-date edits

### F5 — A dispatched CI run checks the remote ref, not local HEAD

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 4 — Manual Verification 4.4
- **Detail**: `origin/notes-relations-risk-tests` is at 0869ad0; CI runs on push only for main. `gh workflow run --ref` tests the remote ref, so unpushed Phase 1–4 commits would yield a green run on the plan-only commit. Pushing needs user approval.
- **Fix**: 4.4: "after the user approves pushing the branch, dispatch CI and confirm the run's `headSha` (`gh run list --branch … --json headSha`) equals `git rev-parse HEAD`."
- **Decision**: FIXED — 4.5 (was 4.4) requires push approval and a `headSha` == `git rev-parse HEAD` check
