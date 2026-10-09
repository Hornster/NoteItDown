---
change_id: e2e-framework-spike
title: Spike an e2e framework with one sign-in scenario running locally and in CI
status: implementing
created: 2026-10-09
updated: 2026-10-09
archived_at: null
---

## Notes

Roadmap item F-01 (`context/foundation/roadmap.md`, milestone M-2 polish-and-hardening).

- Outcome: an e2e framework is installed and one sign-in scenario passes locally and as a CI job on push, against a local Supabase only.
- PRD refs: FR-007, Open Question 1, Constraints (local Supabase only).
- Unlocks: S-01 (auth-risk-tests), S-02 (notes-relations-risk-tests); resolves Open Roadmap Question 1 (does the e2e framework fit the timeline?).
- Open unknown for planning: does the e2e run share the existing `smoke` job's local-Supabase setup, or need its own CI job?
- Keep to one scenario — not a full e2e suite. Integration suite is the fallback if the framework misfits.
