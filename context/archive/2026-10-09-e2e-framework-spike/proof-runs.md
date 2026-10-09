# CI proof runs — e2e-framework-spike

Evidence for Risk #6 (test-plan §2): the e2e layer fails loudly in CI instead of passing by skipping or by coinciding with the degraded "anonymous" state. Each proof ran `gh workflow run ci.yml --ref <branch>` (dispatched, so `deploy` was skipped in every run). P2–P6 branched from `main` at `1f94969` with one breaking commit each. The branches were throwaway, never merged, and were deleted after recording.

Date: 2026-10-09. Base: `main` @ `1f94969`.

| #   | Branch                         | Change                                                   | Expected                      | Observed                                                                                      | Run                                                             |
| --- | ------------------------------ | -------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| P1  | `main`                         | none                                                     | green; e2e `1 passed`         | green (`ci`, `local-stack` success; `deploy` skipped)                                         | https://github.com/Hornster/NoteItDown/actions/runs/37986627459 |
| P2  | `e2e-proof/2-wrong-url`        | spec expects `/campaigns/<id>-wrong`                     | red; artifact with trace      | red at `Run npm run test:e2e`; `playwright-report` artifact contains `trace.zip` + screenshot | https://github.com/Hornster/NoteItDown/actions/runs/37986630552 |
| P3  | `e2e-proof/3-supabase-stopped` | `supabase stop --no-backup` step after build, before e2e | red; preflight names Supabase | red at `Run npm run test:e2e` (integration had passed before the stop)                        | https://github.com/Hornster/NoteItDown/actions/runs/37986633965 |
| P4  | `e2e-proof/4-port-mismatch`    | `webServer.command` `--port 4323`, `url` stays 4322      | red via `webServer` timeout   | red at `Run npm run test:e2e` after 61 s                                                      | https://github.com/Hornster/NoteItDown/actions/runs/37986637564 |
| P5  | `e2e-proof/5-testdir-typo`     | `testDir: "tests/e2e-typo"`                              | red ("no tests found")        | red at `Run npm run test:e2e`; no zero-test guard needed                                      | https://github.com/Hornster/NoteItDown/actions/runs/37986641272 |
| P6  | `e2e-proof/6-test-only`        | `test(` → `test.only(`                                   | red via `forbidOnly`          | red at `Run npm run test:e2e`                                                                 | https://github.com/Hornster/NoteItDown/actions/runs/37986644525 |

## Decisive log lines (`local-stack` job, step `Run npm run test:e2e`)

- **P1**: `✓  1 [chromium] › tests/e2e/signin.spec.ts:5:1 › a seeded user signs in and lands on their own campaign (1.4s)` / `1 passed (7.8s)`
- **P2**: `Error: expect(page).toHaveURL(expected) failed` / `Expected: "http://localhost:4322/campaigns/73c7674f-…-wrong"` / `Received: "http://localhost:4322/campaigns/73c7674f-…"`. The received URL is the seeded user's real campaign, so the session itself worked and only the deliberately wrong oracle failed.
- **P3**: `Error: e2e tests: local Supabase not running — run \`npx supabase start\`.`
- **P4**: `Error: Timed out waiting 60000ms from config.webServer.`
- **P5**: `Error: No tests found`
- **P6**: `Error: item focused with '.only' is not allowed due to the 'forbidOnly' option in '../../playwright.config.ts': "signin.spec.ts a seeded user signs in and lands on their own campaign"`

## Notes

- Every red run failed at the e2e step itself. No earlier step went red and masked the proof, and the smoke step never ran after the failure.
- The `if: failure()` upload step ran in all five red runs, so each has a `playwright-report` artifact. Only P2 has a test-level trace, because P3–P6 fail before any test executes.
- Supabase image pulls hit `toomanyrequests: Rate exceeded` from `public.ecr.aws` in several runs when six jobs started at once. The CLI retried and every stack came up. This only matters if many CI runs start in parallel.
- No GoTrue 429s were observed.
- **P2 recheck after da390fe** (upload condition changed to `failure() && steps.e2e.outcome == 'failure'`): branch `e2e-proof/2-wrong-url-recheck` (same change as P2, based on `main` @ `da390fe`, since deleted). It went red at `Run npm run test:e2e` and the upload step ran (`playwright-report` artifact, 1.1 MB). Run: https://github.com/Hornster/NoteItDown/actions/runs/37992166514
