<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Constants Sweep (S-04), Phase 4 (Test literals, regression guard and docs)

- **Plan**: context/changes/constants-sweep/plan.md
- **Mode**: Deep (verification run inline: the proposed ESLint selectors and the probe command were executed against the current tree)
- **Date**: 2026-10-13
- **Verdict**: SOUND (all 4 findings fixed in plan during triage)
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

Grounding: 11/11 paths ✓ (5 `tests/http`, 3 `tests/integration`, `eslint.config.js`, README, test-plan), 4/4 doc line refs ✓ (`contract-surfaces.md:78-80,167`, `README.md:161`, `test-plan.md:148`), symbols ✓ (`PG_ERROR` covers all 6 codes; `@/` alias already imported in `tests/http/support/assertions.ts:3`), test literals ✓ (6 status literals in `tests/http`, 19 SQLSTATEs in `tests/integration`), selectors ✓ (61 hits in exactly the 17 research files, no false positives), brief↔plan ✓.

## Findings

### F1 — The 4.2 probe command fails with a parse error, not the rule

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4, Success Criteria 4.2
- **Detail**: `printf … | npx eslint --stdin --stdin-filename src/probe.ts` exits 1 with `Parsing error: …/src/probe.ts was not found by the project service` (`projectService: true` in `eslint.config.js`, no `allowDefaultProject`). The exit code is non-zero, so a check on exit code alone passes without the rule running. With an existing filename (`--stdin-filename src/lib/api.ts`), the same input reports `1:45 error … no-restricted-syntax` (verified with the plan's selectors).
- **Fix**: Use `--stdin-filename src/lib/api.ts` (stdin replaces the file's contents; nothing is written) and require the output to contain `no-restricted-syntax`, not just a non-zero exit.
- **Decision**: FIXED (Fix in plan)

### F2 — test-plan §6.6 keeps the S-04 defects listed as open, and the deferred image defects lose their pointer

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 4 §5 (Reference docs and follow-up)
- **Detail**: `test-plan.md` §6.6 lists "Known defects deliberately left for S-04" (four auth defects under Phase 3, two image 500s under Phase 2) and the "Constants gap left for S-04" (`HTTP_STATUS.FOUND`). Phase 4 edits only `test-plan.md:148`. After S-04 the auth defects and the 302 gap are fixed but still read as open, and the image 500s still say S-04 while the plan moves them to `context/changes/constants-sweep/follow-ups/deferred-image-defects.md`. That note gets archived with the change, and nothing in `roadmap.md` or `test-plan.md` points to archived follow-ups, so the deferral becomes hard to find.
- **Fix**: Add to Phase 4 §5 an appended S-04 note in test-plan §6.6: the four auth defects and the 302 gap are resolved in S-04; the two image 500s are deferred, with the path of the follow-up note.
- **Decision**: FIXED (Fix in plan)

### F3 — The selector set misses `redirect(url, NNN)`, the most likely next status literal

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 4 §3 (ESLint guard)
- **Detail**: The six selectors cover `status:` properties, `.status =` assignments, `jsonError`'s second argument, `.status` comparisons and `*status*` declarators. They do not cover `Astro.redirect(url, 301)`, `context.redirect(url, 303)` or `Response.redirect(url, 307)`. The app has many redirects and keeps them implicit, so an explicit redirect status is the most likely way a new literal arrives. `switch (res.status) { case 404: }` is also not covered. The brief names only the false-positive risk, not these gaps.
- **Fix**: Add `CallExpression[callee.property.name='redirect'] > Literal.arguments:nth-child(2)[raw=/^[1-5][0-9]{2}$/]` (no hits today, since all 61 current literals are already matched by the other selectors) and name the remaining gap (`switch`/`case`) in the lesson.
- **Decision**: FIXED (Fix in plan; selector verified: 0 hits in src/, fires on `c.redirect("/x", 301)` and `Response.redirect(url, 307)`)

### F4 — The 4.6 oracle expects test-name hits that do not exist

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4, Success Criteria 4.6
- **Detail**: All 19 current matches of `'"(23505|…|P0002)"'` in `tests/integration` are `toBe("…")` assertions. Test names mention codes unquoted (e.g. "returns P0002 for a foreign user's note"), which the quoted pattern does not match. After the swap the grep prints nothing. "Prints only test-name strings" is a looser oracle than it needs to be, and it would let a leftover assertion pass as a "test name".
- **Fix**: Change 4.6 (both the criterion and the Progress line) to "prints nothing".
- **Decision**: FIXED (Fix in plan)
