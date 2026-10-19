---
project: NoteItDown
checked_at: 2026-10-19T22:25:00Z
health_status: needs-attention
context_type: brownfield
language_family: js
stack_assessment_available: true
checks_run:
  - lockfile
  - dependency_audit
  - outdated_deps
  - test_runner
  - ci_cd
  - configuration
audit_findings:
  critical: 0
  high: 4
  moderate: 0
  low: 0
test_runner_detected: true
ci_provider: GitHub Actions
recommended_fixes: 6
---

## Dependency Health

### Lockfile

```
Status: present (package-lock.json)
Package manager: npm (Node 22.14.0 per .nvmrc)
```

### Security Audit

```
Tool: npm audit --json
Summary: 0 CRITICAL, 4 HIGH, 0 MODERATE, 0 LOW
Direct vs transitive: 1 direct (wrangler), 3 transitive (miniflare, @cloudflare/vite-plugin, sharp)
```

#### HIGH findings

All four entries have **one root cause**: `sharp@0.35.4`, which is affected by a vulnerability in its bundled librsvg (SVG decoding). npm reports the packages that pull it in as vulnerable too.

- **sharp** 0.35.4 (transitive): GHSA-wq5f-xc86-pv6w / CVE-2026-96889, a librsvg vulnerability. Fixed in 0.35.5. It is reached through two paths: `astro@7.3.2 → sharp` and `wrangler@4.148.0 → miniflare → sharp`.
- **wrangler** 4.148.0 (direct): flagged only because of the sharp chain above. 4.151.2 is available within your `^4.15.2` range.
- **miniflare** 5.20261006.0-alpha (transitive, via wrangler): same sharp chain.
- **@cloudflare/vite-plugin** (transitive, via @astrojs/cloudflare): same sharp chain.

Exposure note: sharp runs at build time and in local dev (Astro image processing, miniflare). The app compresses images in the browser (`src/lib/images/compress.ts`), and uploaded user images aren't decoded by sharp on the server. The realistic risk is therefore limited to the dev and CI machines processing SVGs. npm reports `fixAvailable: true` for every entry, which means the fix stays within your current version ranges.

### Outdated Dependencies

```
Packages with major version gaps: 3 (all exactly 1 major behind; none 2+ behind)
```

- **typescript**: 6.0.3 → 7.0.2 (1 major). TS 7 is the native-compiler rewrite, and `typescript-eslint` 8.x and `@astrojs/check` support for it should be confirmed before moving.
- **@astrojs/react**: 6.0.5 → 7.1.0 (1 major). Check its Astro peer range first.
- **lint-staged**: 16.4.0 → 17.6.0 (1 major). Dev tooling only.

22 more packages have newer minor or patch versions within their declared ranges, including astro 7.4.1, @astrojs/cloudflare 14.4.1, @supabase/supabase-js 2.118.0, vitest 5.0.5 and wrangler 4.151.2. `npm update` picks them up.

## Test Suite

```
Test runner: Vitest 5.0.1 (projects: unit, hooks, integration, http) + Playwright 1.64.0 (e2e)
Tests found: 211 unit+hooks tests (19 files); 124 integration+http entries; 8 e2e tests (5 files)
Test execution: passing (unit + hooks run locally: 211/211 passed in 8.3s); integration/http/e2e enumerated, not executed (they need local Supabase and a fresh build)
```

```
Configuration: vitest.config.ts, playwright.config.ts
Framework: Vitest 5.0.1, @playwright/test 1.64.0
```

The agent can check its own changes at three levels: per-edit hooks (eslint plus `vitest related`), end-of-turn sweeps, and the full suites in CI. Data isolation already has dedicated coverage: the route-guard matrix and `tests/http/forged-id.test.ts`. This matters because v3 adds the per-user image-usage total, which PRD v3 names as a new isolation surface (FR-014).

## CI/CD

```
Provider: GitHub Actions
Configuration: .github/workflows/ci.yml
```

| Stage      | Status | Notes                                                                                   |
| ---------- | ------ | --------------------------------------------------------------------------------------- |
| Lint       | ✓      | `npm run lint` (ESLint 10, strictTypeChecked)                                           |
| Test       | ✓      | unit + hooks in `ci`; integration + http + e2e + smoke in `local-stack` against local Supabase |
| Build      | ✓      | `npm run build` (in both jobs), deploy via `npx wrangler deploy` on `main` only          |
| Type check | ✓      | `npx astro check` (after `npx astro sync`)                                              |
| Security   | ✗      | not configured: no `npm audit` step, no Dependabot, no CodeQL                           |

## Configuration

### High severity

None. `tsconfig.json` extends `astro/tsconfigs/strict`, and `.gitignore` is present (it ignores `.env` and `.dev.vars`).

### Medium severity

None. Prettier (`.prettierrc.json`) and ESLint (`eslint.config.js`) are both configured and enforced by lint-staged.

### Low severity

- **`.editorconfig`**: missing. Prettier covers the files it formats, but editors still apply their own defaults to files Prettier skips, such as `.sql` migrations and shell hooks. Fix: add a minimal `.editorconfig` (see Recommended Fixes).
- **`package.json` name**: still `10x-astro-starter`. It isn't user-visible, but it's the same kind of starter leftover that PRD v3 removes from the landing page, and Workers Logs and stack-assess both read the project name from here. Fix: rename to `note-it-down`, matching `wrangler.jsonc`.

`.env.example`, `CLAUDE.md` (and the `AGENTS.md` symlink) are present.

## Stack Assessment Cross-Reference

```
Stack assessment: context/foundation/stack-assessment.md
Agent readiness (from stack-assess): ready-with-compensation
```

| Quality Gate Gap                                  | Health-Check Finding                                                                                                                          | Status                     |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| typed ~ (untyped Supabase client)                 | `astro check` + strictTypeChecked lint run in CI, but neither can see DB row shapes. The "Supabase data boundary" block isn't in CLAUDE.md yet. | Open (compensation missing) |
| training data ~ (Astro 7 / Tailwind 4 / zod 4 drift) | Dependencies are current within their majors (no 2+ gaps). The "Versions & legacy idioms" block isn't in CLAUDE.md, although the Context7 rule exists in `.claude/rules/context7.md`. | Partially mitigated        |
| training data ~ (Workers runtime)                 | `local-stack` runs e2e + smoke against the production preview (workerd), so a Node-only dependency fails CI before deploy. The "Cloudflare Workers runtime" block isn't in CLAUDE.md. | Mitigated by CI; rule missing |
| Error-detail split (FR-011/FR-012)                | `wrangler.jsonc` has `observability.enabled: true`, so a log sink exists. The "Error handling & logging" block isn't in CLAUDE.md, and the two ad-hoc `console.error` sites remain. | Open (compensation missing) |
| Version drift (new)                               | TypeScript 7 is now available. Upgrading during v3 would add a fresh drift gap (TS 7 is newer than any training data and may not be supported by typescript-eslint 8). | Reinforced: defer upgrade  |

The stack assessment's verdict assumes its four compensation blocks are in the instruction file. None of them are yet, so the "with compensation" part isn't in place.

## Recommended Fixes

The project already has CI, an agent instruction file, deployment config and agent hooks, so there are no "upcoming lesson" items. Everything below is actionable now, ordered by impact on agent work.

### Fix before agent work (Category A)

### 1. Patch the sharp/librsvg advisory (4 HIGH findings, one root cause)

**Impact**: a red `npm audit` makes every later audit noisy, and the agent can't tell new advisories from known ones. sharp runs in every build and local dev session.
**Severity**: high
**Effort**: quick (< 5 min)
**Fix**:

```bash
npm update sharp wrangler @astrojs/cloudflare astro
npm ls sharp            # expect sharp@0.35.5 on both paths
npm audit               # expect 0 high
```

`package.json` → `allowScripts` lists `sharp@0.35.4`. Add `"sharp@0.35.5": true`, and a matching `workerd@…` entry if wrangler pulls a new workerd, so the install scripts keep running. Then follow the CLAUDE.md rule for dependency upgrades: `npm run build && npm run preview` with `npm run smoke` against it.

### 2. Add the four stack-assessment compensation blocks to CLAUDE.md

**Impact**: v3 is mostly work where those blocks prevent mistakes: new DB reads (search, quota usage), UI on Tailwind 4 / Astro 7, a possible fuzzy-search dependency on Workers, and the error helper. Without the blocks, the agent falls back on training-data defaults.
**Severity**: medium
**Effort**: moderate (15–30 min, mostly reviewing the wording)
**Fix**: copy the four fenced blocks from `context/foundation/stack-assessment.md` → "Recommended Instruction File Additions" into `CLAUDE.md` under `## Architecture → ### Key conventions`. Edit `CLAUDE.md`, not `AGENTS.md` (symlink). Then restart the session so the new rules load.

### 3. Add a security stage to CI

**Impact**: nothing currently stops a new CRITICAL advisory from reaching `main` and deploying. Opening the app to other users (PRD v3 motivation) raises the stakes.
**Severity**: medium
**Effort**: quick (< 5 min)
**Fix**: add a step to the `ci` job in `.github/workflows/ci.yml` after `npm ci`:

```yaml
      - run: npm audit --audit-level=critical
```

Also add `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    groups:
      minor-and-patch:
        update-types: [minor, patch]
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: monthly
```

`--audit-level=critical` blocks only critical advisories. The HIGH sharp case above is triaged by hand, which matches the "fix critical, consciously accept the rest" triage rule in CLAUDE.md.

### 4. Take in-range updates; hold the three major bumps until after v3

**Impact**: astro 7.4, @astrojs/cloudflare 14.4 and supabase-js 2.118 are low-risk catch-ups. The major bumps (TypeScript 7, @astrojs/react 7, lint-staged 17) would add new drift and possible lint or type-check breakage during the 2026-11-04 landing-page deadline.
**Severity**: low
**Effort**: moderate (15–30 min including verification)
**Fix**:

```bash
npm update
npm run lint && npm test && npx astro check && npm run build && npm run smoke
```

Record the deferral in `context/foundation/lessons.md` or the v3 roadmap ("TypeScript 7 / @astrojs/react 7 / lint-staged 17 deferred until after v3; check typescript-eslint TS 7 support first"), so an agent doesn't run `npm install typescript@latest` by itself.

### 5. Add `.editorconfig`

**Impact**: keeps SQL migrations, shell hooks and YAML consistent across editors, which are the files Prettier doesn't format.
**Severity**: low
**Effort**: quick (< 5 min)
**Fix**:

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = space
indent_size = 2

[*.md]
trim_trailing_whitespace = false
```

### 6. Rename the package from the starter name

**Impact**: a small but real starter leftover, in line with PRD v3's "no starter-template text" goal. It also makes tool output and logs name the actual project.
**Severity**: low
**Effort**: quick (< 5 min)
**Fix**: in `package.json`, change `"name": "10x-astro-starter"` to `"name": "note-it-down"`, then run `npm install` to refresh `package-lock.json`. This fits in the landing-page slice.

### Addressed in upcoming lessons (Category B)

None. CI/CD ([M1L5](https://platforma.przeprogramowani.pl/external/10xdevs-3/m1-l5)), the agent instruction files ([M1L4](https://platforma.przeprogramowani.pl/external/10xdevs-3/m1-l4)) and deployment config are already in place from earlier milestones.

## Summary

Health status: **needs-attention**

The project is in good operational shape. The lockfile is present, TypeScript is strict, linting is strict and type-checked, and 211 unit and hook tests pass. Integration, HTTP and e2e suites run in CI against a local Supabase, the deploy is gated on all of them, and agent hooks give per-edit feedback. Two things keep it from "healthy": four HIGH audit findings that come from one `sharp` advisory and are fixed by a quick in-range update, and the fact that none of the stack assessment's compensation rules have been added to `CLAUDE.md` yet. CI also has no security stage.

Next step: apply fixes 1–3 (about 30 minutes in total) before starting v3 work, then continue with the v3 roadmap, starting with the time-bound landing-page slice.
