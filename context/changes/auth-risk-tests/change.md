---
change_id: auth-risk-tests
title: Named auth risk scenarios, each covered by a test that runs in CI
status: implementing
created: 2026-10-10
updated: 2026-10-11
archived_at: null
---

## Notes

Roadmap slice S-01 (`context/foundation/roadmap.md`), PRD refs FR-007, FR-008, FR-010.

- Outcome: developer can rely on an explicit list of named auth risk scenarios (signup, signin, signout, session behavior, protected-route redirect), each covered by at least one test that runs on push in CI.
- Prerequisites: F-01 (e2e-framework-spike) — done.
- Open unknown (owner: user): does the existing `smoke` auth check overlap the new auth e2e scenarios enough to retire part of it?
- Risk: binding PRD constraint — auth tests must land before any auth page or route is edited (S-04, S-05); map existing coverage first, add only the gaps.
- Plan review (2026-10-11): **Phase 1 only** reviewed — 3 warnings (dist/ staleness + rebuild in 1.7, orphan preview on setup failure, silent route drops in inventory), all fixed in plan.
- Plan review (2026-10-11): **Phase 2** reviewed — SOUND; 1 warning (replay rows sharing one snapshot jar) + 2 observations (raw URL concatenation in `send`, path-variant intent wording), all fixed in plan (report: `reviews/plan-review-2.md`). Phases 3–4 not yet reviewed.
- Plan review (2026-10-11): **Phase 3** reviewed — SOUND; 2 warnings (duplicate-signup baseline pins enumeration defect, approval sequencing/locator) + 2 observations (3.5 mutation, UI_BASELINE vs MESSAGES rule); F1 (Fix A), F2, F4 fixed in plan, F3 accepted (report: `reviews/plan-review-3.md`).
- Plan review (2026-10-11): **Phase 4** reviewed — SOUND; 1 warning (`npm test` "every Vitest project" wording) + 2 observations (test-plan stale lines, 4.3 push deploys); all three fixed in plan (report: `reviews/plan-review-4.md`).
