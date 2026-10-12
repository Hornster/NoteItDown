<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Notes, Relations & Isolation Risk Tests

- **Plan**: context/changes/notes-relations-risk-tests/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-12
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

## Verification evidence

- `npm run lint`: pass
- `grep -rn "service_role\|SERVICE_ROLE" tests/`: no hits
- `supabase/config.toml:191`: `sign_in_sign_ups = 50`
- `npm run test:integration`: 7 files, 133 tests, all passed
- `npm run build && npm run test:http`: the first run had 1 failure out of 100 tests and the failing test was not captured. The next 6 runs passed 100/100 (see F4).
- `npm run test:e2e`: 6 tests, all passed
- Prettier check on test-plan.md, TESTING.md and CLAUDE.md: pass. The "TBD" grep and the "30 / 5 min" grep return no hits.
- No `src/` changes on the branch
- CI run 38300715371 on `dd0f171`: `ci` and `local-stack` succeeded. HEAD `83b8eda` changes only plan.md and change.md.
- Plan drift: every planned item matches, nothing is missing or drifted. Unplanned files (`tests/http/support/assertions.ts`, `tests/integration/helpers.ts`, `lessons.md`, `roadmap.md`, `TODO.md`) are benign enablers or housekeeping.

## Findings

### F1 — Forged-ID API rows have no owner positive control

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: tests/http/forged-id.test.ts:149-155, 180-259
- **Detail**: The only positive control (line 150) covers a page: A's jar is served A's note page. Every API row (PATCH/DELETE note, POST images/uploads, POST images, GET/PATCH/DELETE image) asserts only `expectApiNotFound`. A handler that returns 404 JSON to everyone, or an `imageA` that never resolves, would pass all of them. The closing "A's data is unchanged" test catches forged writes that succeed. It does not catch a route that is broken for its owner too.
- **Fix**: Add owner-control rows with A's jar on A's ids: GET `.../notes/{noteA}/images/{imageA}` → 200, and POST `.../images/uploads` with the same valid body → 200 or 201. Neither row changes A's data, so the final re-read stays valid.
  - Strength: Each 404 then proves a denial and not a broken route, which mirrors the page-level control already at :150.
  - Tradeoff: Two more rows and no new auth calls. The uploads call issues a signed URL that nothing uses, which is harmless.
  - Confidence: HIGH — the routes and the jar already exist in the file.
  - Blind spot: I haven't checked whether `uploads` returns 200 or 201; read it from the route before asserting.
- **Decision**: FIXED — two owner-control rows added to the `positive control` block: GET image → 200, POST uploads → 200, both checked against the routes. forged-id.test.ts passes 38/38.

### F2 — Forged-cookie rows can't tell "cookie ignored" from "cookie never read"

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/http/forged-id.test.ts:263-279
- **Detail**: B has exactly one campaign, so the expected redirect target `/campaigns/{B}` is also the default fallback. If `readRememberedCampaign` stopped reading the cookie altogether, these rows would still pass. The `res.body` not-contains check at :277 is trivially true for a redirect body.
- **Fix**: In `beforeAll`, B creates a second campaign through B's client (no auth call). Add one control row: plant that campaign's id → 302 to `/campaigns/{B2}`. This shows the cookie is honoured when owned and ignored only when foreign.
- **Decision**: FIXED — B's second campaign is seeded in `beforeAll` through B's client, and a control row checks that `/dashboard` honours B's own non-default campaign cookie. forged-id.test.ts passes 39/39 and lint is clean.

### F3 — Literal `302` in new test code; `HTTP_STATUS` has no `FOUND`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/http/support/session.ts:13, tests/http/forged-id.test.ts:275
- **Detail**: The lessons.md rule says to use `HTTP_STATUS` and to add missing entries instead of writing inline literals. `src/lib/constants/http-status.ts` has no 302 entry, so the new code copied the literal from the older `assertions.ts:9` and `session-revocation.test.ts:54`. Adding `FOUND` is a `src/` change, and this plan rules those out ("No `src/` changes").
- **Fix**: Log it in test-plan.md §6.6 among the items left for S-04 (constants-sweep): add `HTTP_STATUS.FOUND` and replace the four `302` literals under `tests/http/`.
- **Decision**: FIXED — logged in test-plan.md §6.6 (Phase 2) as a constants gap left for S-04: add `HTTP_STATUS.FOUND` and replace the `302` literals in `tests/http/`.

### F4 — One unreproduced HTTP suite failure

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: tests/http/ (failing test not identified)
- **Detail**: The first `npm run test:http` straight after `npm run build` reported 1 failed / 99 passed in one file. The output was truncated before the failing test's name. Six later runs passed 100/100: one immediately after, then five spaced 70 s apart. CI was green as well. The cause is unknown; first-request warm-up of the fresh preview is a guess, not verified.
- **Fix**: If it happens again, capture the full output (`npx vitest run --project http --reporter=verbose`) and record which test failed before deciding anything.
- **Decision**: ACCEPTED — watch for a recurrence; if it happens, capture verbose output and identify the test before acting. No code change.

### F5 — "No notice after create" check can run before hydration

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/e2e/notes-relations.spec.ts:115
- **Detail**: `RelationChangeNotice` fills its state in a `useEffect`, so the SSR HTML never contains `role=status`. `toHaveCount(0)` can pass at once, before the island hydrates, which means a notice that appears late would be missed. The positive notice assertions retry automatically and are sound.
- **Fix**: Call `waitForHydration(page)` before the count-0 assertion, or drop the assertion, since create writes no notice.
- **Decision**: FIXED (differently) — `waitForHydration` needs a button the empty notice island lacks, so the spec now waits for `astro-island[component-url*="RelationChangeNotice"]:not([ssr])` before the count-0 assertion. notes-relations.spec.ts passes 2/2.

### F6 — Seeding helpers duplicated and a cross-project fixture import

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/http/forged-id.test.ts:11, 45-54; tests/e2e/notes-relations.spec.ts:184-191
- **Detail**: `createNoteVia` (http) and the inline `create_note` RPC (e2e) both re-implement `createTestNote` from `tests/integration/helpers.ts`, because that helper takes no `content` argument. `forged-id.test.ts` also imports `webpFixture` from `../integration/helpers`, which pulls the integration-only helpers into the http project. It works, but shared fixtures belong in `tests/support/`.
- **Fix**: Skip for now. Fold it into the next test-infra change: give `createTestNote` an optional `content` and move the image fixtures to `tests/support/`.
- **Decision**: DEFERRED — queued in `follow-ups/review-fixes.md` for the next test-infra change.

### F7 — Leftover `TODO.md` notes and roadmap status

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: TODO.md:3-6, context/foundation/roadmap.md:46,118
- **Detail**: `TODO.md` gained "run plan review" and two implementer notes. Both are now in plan.md (Critical Implementation Details) and test-plan.md §6.2/§6.4, and the plan review has been run. Roadmap S-02 says `in-progress` while the change is implemented and reviewed.
- **Fix**: Remove the three now-redundant TODO.md items. Mark S-02 `done` in the roadmap when the change is merged or archived.
- **Decision**: FIXED — TODO.md restored to main's version (the three redundant items are gone). Roadmap S-02 stays `in-progress` until merge or archive.

## Dismissed during compilation

- The agent suggested the matrix header promises tenant-B SELECT cells. It doesn't: the header (rls-policy-matrix.test.ts:10-18) makes no such claim, plan §3.1 asks only for B insert/update/delete, and B reads are covered in the service tests. Not a finding.
- No B re-read after the `relations` insert cell (:448-457). The plan requires only 42501. A weakened policy would produce 23505, which still fails the test. Safe.

## Triage summary (2026-10-12)

- Fixed: F1, F2, F3 (logged for S-04), F5 (by a different method), F7
- Accepted: F4 (watch for recurrence)
- Deferred: F6 (`follow-ups/review-fixes.md`)
- After the fixes: `npm run lint` is clean, `npm run test:http` passes 103/103, and `tests/e2e/notes-relations.spec.ts` passes 2/2.
