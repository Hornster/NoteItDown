---
project: NoteItDown
assessed_at: 2026-10-19T00:00:00Z
agent_readiness: ready-with-compensation
context_type: brownfield
prd: context/foundation/prd-v3.md
stack_components:
  language: TypeScript 6.0 (strict)
  framework: Astro 7.3 SSR + React 19.3 islands (Tailwind 4.3 + shadcn/ui)
  build_tool: Vite via Astro + @astrojs/cloudflare 14.3
  test_runner: Vitest 5.0 (unit/hooks/integration/http) + Playwright 1.64 (e2e)
  package_manager: npm
  ci_provider: GitHub Actions
  deployment_target: Cloudflare Workers (+ Supabase Postgres/Auth/Storage)
gates_passed: 11
gates_failed: 0
gates_partial: 4
---

## Stack Components

**Language: TypeScript 6.0.3.** `tsconfig.json` extends `astro/tsconfigs/strict`, with `@/*` path aliases. ESLint 10 runs `tseslint.strictTypeChecked` + `stylisticTypeChecked`, and CI runs `astro check`. zod 4.6 validates API input.

**Framework: Astro 7.3.2** in full SSR (`output: "server"`), with React 19.3 islands. The UI layer is Tailwind 4.3 (CSS-first, `@theme inline` in `src/styles/global.css`, no `tailwind.config.*`), shadcn/ui in the "new-york" style, and `@xyflow/react` 12.12 + `d3-force` for the memory map. Secrets come through `astro:env/server` and build mode through `import.meta.env.{DEV,PROD,SSR}`.

**Backend service: Supabase.** The app uses `@supabase/supabase-js` 2.116 and `@supabase/ssr` 0.12.7 for cookie sessions, with Postgres + RLS (8 migrations, including SQL functions for note create/edit/delete and relation detection) and Storage for note images. The client is **untyped**: there are no generated `Database` types, a deliberate earlier choice (`src/lib/services/notes.ts:79`).

**Build / runtime: Vite (via Astro) + `@astrojs/cloudflare` 14.3.4**, deployed with wrangler 4.148 to Cloudflare Workers (`nodejs_compat`, `observability.enabled: true` in `wrangler.jsonc`).

**Test runners: Vitest 5.0.1** with four projects (unit, hooks, integration, http). **Playwright 1.64** runs Chromium e2e and on-demand screenshots. Integration and e2e run only against a local Supabase.

**Tooling and CI.** Prettier 3.9 handles formatting, and husky + lint-staged run on commit. GitHub Actions has three jobs: `ci` (sync, lint, unit, hooks, astro check, build), `local-stack` (integration, http, e2e, smoke) and `deploy` (main only). Claude Code agent hooks run eslint plus related unit tests after each edit and at end of turn.

**Instruction files.** `CLAUDE.md` (with `AGENTS.md` as a symlink) has 128 lines covering commands, architecture, auth flow, conventions and CI. There is also `.claude/rules/context7.md` (docs lookup), `context/foundation/lessons.md` and `docs/reference/contract-surfaces.md`.

## Quality Gate Assessment

| Component                         | Typed | Convention | Training Data | Documented | Verdict           |
| --------------------------------- | ----- | ---------- | ------------- | ---------- | ----------------- |
| Language (TypeScript 6)           | ✓     | —          | —             | —          | pass              |
| Framework (Astro 7 SSR)           | —     | ✓          | ~             | ✓          | pass-with-note    |
| UI layer (React 19 + Tailwind 4 + shadcn) | — | ✓      | ~             | ✓          | pass-with-note    |
| Data/backend (Supabase)           | ~     | —          | ✓             | ✓          | pass-with-note    |
| Build/runtime (Vite + CF Workers) | —     | ✓          | ~             | ✓          | pass-with-note    |
| Test runners (Vitest 5 + Playwright) | —  | —          | ✓             | ✓          | pass              |

Legend: ✓ = pass, ✗ = fail, ~ = partial, — = not applicable

Result: 11 checks pass, 4 are partial, none fail.

### Gate Details

**Typed**
- Language ✓: `tsconfig.json` extends `astro/tsconfigs/strict`, `eslint.config.js` uses `strictTypeChecked`, and CI runs `npx astro check`.
- Supabase ~: `createServerClient(...)` in `src/lib/supabase.ts` takes no `Database` generic, so every `.from("…").select(…)` returns loosely typed rows. Type safety stops at the DB boundary unless each service shapes the result by hand. v3 adds new DB reads there: description search, the per-user image-usage total and quota checks.

**Convention-based**
- Astro ✓: file-based routes in `src/pages/`, `src/middleware.ts`, `PROTECTED_ROUTES`, `export const prerender = false` on API routes. All of it is documented in CLAUDE.md.
- UI layer ✓: the shadcn primitives in `src/components/ui/` and the `cn()` helper set the pattern, and a semantic-token-only color rule is enforced by `src/styles/theme-guard.test.ts`.
- Build/runtime ✓: the adapter and `wrangler.jsonc` follow the Astro Cloudflare defaults, and the deploy happens only through CI.

**Popular in training data** (judged within the JS/TS family)
- Astro ~: Astro is mainstream among JS meta-frameworks, but 7.x is newer than most training data, which is concentrated on Astro 2–4. Older idioms an agent is likely to produce: `Astro.locals.runtime.env`, `import.meta.env` for secrets, `getStaticPaths`-centric examples, or the experimental flags that the fonts and `astro:env` APIs used to need. This repo uses `astro:env/server` and the stable `fonts` config.
- UI layer ~: React 19 and shadcn are well represented. Tailwind 4 is CSS-first (`@import "tailwindcss"`, `@theme inline`), and agents still default to v3 habits: `tailwind.config.js`, `theme.extend`, `@tailwind base`.
- Build/runtime ~: Workers is mainstream but has a non-Node runtime. Agents reach for `fs`, `Buffer`-heavy or native-addon npm packages that break at deploy even though `npm run dev` passes. This matters in v3 if fuzzy search pulls in a library.
- Supabase ✓, Vitest ✓, Playwright ✓: all mainstream. The Vitest `projects` setup is a stable API.

**Well-documented**
- All components ✓: docs.astro.build, tailwindcss.com, react.dev, supabase.com/docs, developers.cloudflare.com/workers, vitest.dev and playwright.dev are current and versioned, and all can be reached through the Context7 rule already in `.claude/rules/context7.md`.

## Gaps & Compensation

The stack is agent-friendly. Its friction is **version drift**: several components (Astro 7, Tailwind 4, TypeScript 6, ESLint 10, Vitest 5, zod 4) are a major version or more ahead of most training data. Add to that one **untyped boundary** (Supabase rows) and one **runtime constraint** (Workers). v3 hits all three:

| Gap | Why it matters for v3 | Compensation |
| --- | --- | --- |
| Untyped Supabase rows | Description search, the image-usage total and quota checks are new DB reads. A mistyped column or aggregate shape fails silently, and an undercounted usage total breaks the "never undercount" quality property. | Parse every new DB result at the service boundary into a type from `src/types.ts` |
| Astro 7 / Tailwind 4 / zod 4 idiom drift | The landing page, search toggles, zoom/pan popup and error pages are all UI and route work where outdated idioms appear | Pin versions in CLAUDE.md and name the forbidden legacy idioms |
| Workers runtime | Fuzzy matching may pull in a library, and the operator-only error detail in FR-012 needs a log sink | State the runtime limits, state that `console.error` goes to Workers Logs, and give the pg_trgm migration convention |
| Error-detail split (dev vs prod) | FR-011/FR-012 need one consistent pattern. Ad-hoc `console.error` already appears in two places (`Topbar.astro:31`, `note-images.ts:143`). | Name a single helper and the build flag that controls disclosure |

### Recommended Instruction File Additions

Paste under `## Architecture → ### Key conventions` in `CLAUDE.md`, or as a new section:

```markdown
### Versions & legacy idioms (training-data drift)

Pinned majors: Astro 7, React 19, Tailwind 4, TypeScript 6, ESLint 10 (flat config), Vitest 5, zod 4, @astrojs/cloudflare 14. Before using a framework API you have not seen in this repo, look it up via Context7 — do not rely on memory.

- Astro: secrets only via `astro:env/server` (declared in `astro.config.mjs` `env.schema`); build mode via `import.meta.env.DEV` / `PROD` / `SSR`. Do not use `Astro.locals.runtime.env` or `import.meta.env.SUPABASE_*`. Fonts use the stable top-level `fonts` config — no `experimental` flags.
- Tailwind 4: there is no `tailwind.config.*`. Tokens live in `src/styles/global.css` under `@theme inline`. Do not add `@tailwind base/components/utilities`, `theme.extend`, or a JS config file.
- zod 4: use `z.email()`, `z.url()` top-level formats and `error` (not `message`/`errorMap`) for custom messages; check Context7 before using v3-era APIs.
- ESLint 10: flat config only (`eslint.config.js`); never add `.eslintrc*`.
```

```markdown
### Supabase data boundary (untyped client)

The Supabase client has no generated `Database` types. Every service function in `src/lib/services/` that reads rows must map the result into an explicit type from `src/types.ts` before returning — never return raw `data` or `any`. For new aggregates (counts, sums such as per-user image usage) parse with zod (`z.object({ ... })`) so a renamed column or null aggregate fails loudly instead of returning 0.
Scope every query by RLS **and** by the explicit owner/campaign filter the existing services use; any new per-user query gets a case in `tests/http/forged-id.test.ts`.
```

```markdown
### Cloudflare Workers runtime

Server code runs in workerd, not Node: no filesystem, no native addons, no long-lived in-memory state between requests. Before adding an npm dependency used on the server, confirm it is pure JS/WASM and Workers-compatible, then verify with `npm run build && npm run preview` (not only `npm run dev`).
Postgres extensions (e.g. `pg_trgm` for fuzzy matching) are enabled in a migration with `create extension if not exists <name> with schema extensions;` — never by hand in the dashboard.
```

```markdown
### Error handling & logging

Server-side `console.error` output is captured by Cloudflare Workers Logs (`observability.enabled` in `wrangler.jsonc`) — that is the operator-only channel for production failure detail. Route all DB-failure handling through one shared helper in `src/lib/` (do not add new ad-hoc `console.error` + `eslint-disable` pairs); the helper logs the detail, returns the accurate status code with the generic user message, and includes extra detail in the response body only when `import.meta.env.DEV` is true. Production responses never contain stack traces, SQL, table or column names.
```

## Summary

**Overall agent-readiness: ready, with compensation.** The stack is typed end to end at the language level and follows strong framework conventions, with mainstream, well-documented components. The repo also compensates for a lot already: a detailed CLAUDE.md, strict type-checked linting, agent hooks, a theme guard test, the Context7 rule and four Vitest projects plus Playwright in CI.

**Key strengths:** strict TypeScript, file-based Astro conventions written into CLAUDE.md, enforced UI token rules, and a test pyramid wired into both agent hooks and CI.

**Key gaps:** idiom drift on recent major versions (Astro 7, Tailwind 4, zod 4), the untyped Supabase row boundary that v3's search and quota queries widen, and Workers runtime limits that matter if fuzzy search adds a dependency. The four instruction blocks above cover them. The error-handling block also sets up FR-011 and FR-012 directly.

**Next step:** `/10x-health-check`, focused on dependency currency for the drifted majors, Workers compatibility of any candidate fuzzy-search package, and the ad-hoc logging sites.
