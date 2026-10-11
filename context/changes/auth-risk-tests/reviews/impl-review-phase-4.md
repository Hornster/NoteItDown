<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Auth Risk Tests Implementation Plan

- **Plan**: context/changes/auth-risk-tests/plan.md
- **Scope**: Phase 4 of 4
- **Reviewed phases**: 4
- **Date**: 2026-10-11
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Evidence

- Phase 4 commit: `4137dfe`. Epilogue `a1ab9c6` added the SHA write-back and CI evidence. A follow-up docs commit, `07957e5`, added the `astro dev` known issue.
- Smoke seams (`scripts/smoke.mjs`) match the contract. Steps accept an optional `exact` flag, and the signout step requires location `/` exactly. The "signin accepts correct password" step calls `jar.clear()` before its request, so the next dashboard step only passes on cookies set by signin. The step list, names and order are unchanged, and smoke still has zero dependencies.
- `TESTING.md` has the new "HTTP route guard (Vitest `http`)" section with prerequisites (Supabase, fresh build, port 4323 free), and the `npm test` line is reworded as planned.
- `CLAUDE.md` adds `test:http`, rewords `npm test`, adds the http step to the `local-stack` bullet, and removes the "no e2e coverage" sentence.
- `test-plan.md` covers every planned item:
  - §3 Phase 3 is `implemented`, with the change folder.
  - §4 has the profile line and the `http` stack row.
  - §5 gate note.
  - §6.3 has the `UI_BASELINE` bullet.
  - §6.4 cookbook: new protected page, public page, API handler, Origin, double-slash.
  - §6.6 has the Phase 3 notes with the 4 S-04 defects.
  - §8 freshness date is bumped.
- Phase 4 doesn't break earlier phases. The smoke changes are independent of `tests/http` and `tests/e2e`, and the docs match the Phase 1–3 behaviour.
- `npm run lint`: exit 0.
- 4.1: after `npm run build`, I ran a preview on 4321 and `BASE_URL=http://localhost:4321 npm run smoke`, which printed "All smoke steps passed" (21/21). The signout step answered `302 /`. Ports were free beforehand, and the preview was stopped afterwards.
- 4.3: CI run 38149648011 on `4137dfe` finished `success`, with `ci` success, `local-stack` success and `deploy` skipped. I checked this with `gh run view`.
- 4.4 is a manual mutation that leaves no trace in the diff; it is accepted as reported. 4.5: I read §6.4 and it is enough on its own to add a protected or public page or an API handler.

## Findings

### F1 — S-04 defects recorded only in test-plan §6.6, not where S-04 will look

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/foundation/roadmap.md:132-143 (S-04 section)
- **Detail**: The plan says the four known defects "are logged as S-04 follow-ups":
  - the malformed-body 500;
  - the prefix over-match;
  - the raw Supabase message / enumeration;
  - literal 401s.

  It also says `UI_BASELINE.signupDuplicateEmail` must be changed on purpose by S-04. They only appear in `test-plan.md` §6.6. The roadmap's S-04 section, which `/10x-plan` reads when S-04 starts, doesn't mention them. Neither does `follow-ups/review-fixes.md`, which already holds one S-04 item from the phase-1 review. Whoever plans S-04 could miss the defects and the deliberate baseline change.
- **Fix**: Add a bullet to the roadmap S-04 section that points to `test-plan.md` §6.6 (four logged auth defects) and to `UI_BASELINE.signupDuplicateEmail` in `tests/e2e/auth-session.spec.ts`, which must change on purpose.
- **Decision**: FIXED — added an "Inherited from S-01" bullet to the roadmap S-04 section (test-plan §6.6 defects + `UI_BASELINE.signupDuplicateEmail`).

### F2 — Unplanned `@ast-grep/napi` added as a runtime dependency in the phase commit

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: package.json:22
- **Detail**: Commit `4137dfe` also brought in work outside the plan: `@ast-grep/napi` (plus about 177 lockfile lines), the ast-grep skills under `.agents/` and `.claude/skills/`, `skills-lock.json`, two lessons and the S-01 status in the roadmap. The commit message says these were "staged by request", so they are documented and harmless. But `@ast-grep/napi` is agent tooling, not app code: nothing in `src/`, `scripts/` or `tests/` imports it. It sits in `dependencies`, while every other tool (eslint, vitest, playwright) is in `devDependencies`. It's a native NAPI module, so as a runtime dependency it gets installed for production too.
- **Fix**: Move `@ast-grep/napi` to `devDependencies` (`npm i -D @ast-grep/napi@^0.50.0`, which removes it from `dependencies`).
- **Decision**: FIXED — `npm i -D @ast-grep/napi@^0.50.0`; moved to `devDependencies`, lockfile entries now `dev: true`.
