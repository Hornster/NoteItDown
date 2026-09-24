---
project: NoteItDown
version: 1
status: draft
created: 2026-09-21
updated: 2026-09-24
prd_version: 1
main_goal: market-feedback
top_blocker: capacity
milestone_id: mvp-memory-map
milestone_seq: 1
milestone_status: open
---

# Roadmap: NoteItDown

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-1: MVP — Notes with Auto-Detected Relations & Memory Map** — Status: open

- **Intent:** Prove that heuristic, exact-name-match relation detection can keep a TTRPG campaign's web of NPCs, places, quests, and observations navigable — without any manual linking step — by shipping the full note-taking + relation-detection + memory-map loop described in the PRD.
- **Source materials:** `context/foundation/prd.md` (v1)
- **Done when:** every F-NN and S-NN below is `done`.
- **Scope anchors:** FR-001 through FR-011, US-01 (full PRD scope — this MVP is small enough to be one milestone).

## Vision recap

A TTRPG participant's campaign notes accumulate faster than they can hand-maintain the connections between them — general note tools require every link to be built manually, and that discipline decays over a long campaign. NoteItDown's core hypothesis — the bet that exact-name text matching alone (no manual linking, no NLP) is enough to keep a growing campaign's web of relations useful and accurate — remains unproven until real notes flow through it. This roadmap sequences work to test that bet as early as possible, then rounds out the rest of the MVP around it.

## North star

**S-02: User can see notes automatically connected on the memory map and navigate between them** — this is the smallest end-to-end flow that proves the core hypothesis; nothing else on this roadmap matters if exact-name matching doesn't produce a map users find useful. Its only real prerequisite is S-01 (note creation) — you can't test matching without notes to match against — so it's sequenced as early as that dependency allows.

> "North star" here means the smallest end-to-end slice whose successful delivery would prove the core hypothesis — placed as early as Prerequisites allow because everything else on the roadmap only matters if this works.

## At a glance

| ID   | Change ID                         | Outcome (user can …)                                           | Prerequisites | PRD refs                               | Status   |
| ---- | ----------------------------------- | ------------------------------------------------------------------ | -------------- | ----------------------------------------- | -------- |
| F-01 | campaign-notes-schema               | (foundation) campaigns/notes/relations schema + RLS + default-campaign-on-signup | —              | FR-002, Access Control                    | done |
| S-01 | create-notes                        | add notes (predefined or custom type) to a campaign                | F-01           | FR-001, FR-003                            | in-progress |
| S-02 | auto-relations-memory-map           | see notes auto-connected on the memory map and navigate between them | S-01           | FR-007, FR-009, FR-010, FR-011, US-01     | proposed |
| S-03 | multi-campaign-support              | create and switch between multiple campaigns                       | F-01           | FR-002                                    | proposed |
| S-04 | note-edit-delete-relation-refresh   | edit or delete a note and see a notice of relations changed        | S-02           | FR-005, FR-006, FR-008                    | proposed |
| S-05 | note-image-attachment               | attach an image to a note                                          | S-01           | FR-004                                    | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                     | Chain                                | Note                                                                                    |
| ------ | -------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------ |
| A      | Note lifecycle & relations | `F-01` → `S-01` → `S-02` → `S-04`      | The core-hypothesis validation chain — main reading order given `market-feedback`.         |
| B      | Campaign management        | `S-03`                                 | Joins Stream A at `F-01` — independent of the matching hypothesis, can run alongside S-01. |
| C      | Note media                 | `S-05`                                 | Joins Stream A at `S-01` — nice-to-have polish, doesn't gate the hypothesis.                |

## Baseline

What's already in place in the codebase as of `2026-09-21` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 7 SSR + React 19 islands, Tailwind 4, shadcn/ui; auth pages/forms built (`src/pages/auth/*.astro`, `src/components/auth/*.tsx`).
- **Backend / API:** partial — auth API routes exist (`src/pages/api/auth/{signin,signout,signup}.ts`); no domain routes for campaigns/notes/relations yet.
- **Data:** partial — Supabase client wired for auth (`src/lib/supabase.ts`); no `supabase/migrations`, no `src/types.ts` — no domain schema (campaigns/notes/relations) exists yet.
- **Auth:** present — full signup/login/signout flow, `src/middleware.ts` gates `/dashboard` via `PROTECTED_ROUTES`, `confirm-email.astro` page.
- **Deploy / infra:** present — `wrangler.jsonc`, GitHub Actions CI with auto-deploy-on-merge, first production deploy already shipped.
- **Observability:** absent — no error tracking or structured logging beyond default console output.

## Foundations

### F-01: Campaign & note data foundation

- **Outcome:** (foundation) Campaigns, notes, and relations tables exist in Supabase with per-user RLS isolation; a default campaign is auto-created for a user at signup.
- **Change ID:** campaign-notes-schema
- **PRD refs:** FR-002 (default-campaign-at-signup part), Access Control (per-user data isolation guardrail)
- **Unlocks:** S-01, S-02, S-03, S-04, S-05 — every downstream slice needs this schema and its RLS boundary before it can be planned or built.
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Sequenced first because every FR touching notes/campaigns/relations needs this schema; getting the per-user RLS boundary wrong here would compromise the Access Control guardrail across every downstream slice, so it's worth isolating and getting right before any user-facing work builds on it.
- **Status:** done

## Slices

### S-01: User can add notes to a campaign

- **Outcome:** User can create a note — a predefined type (NPC/Place/Quest/Observation) or a custom, campaign-unique type — with plain-text content, inside their campaign.
- **Change ID:** create-notes
- **PRD refs:** FR-001 (consumed — already satisfied by baseline auth), FR-003
- **Prerequisites:** F-01
- **Parallel with:** S-03
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Kept deliberately thin — just note creation, no matching logic yet. Sequenced immediately after F-01 because it's the minimal prerequisite for the north star (S-02): you can't test whether exact-name matching produces a useful map without notes to match against first.
- **Status:** in-progress

### S-02: User can see notes automatically connected on the memory map and navigate between them

- **Outcome:** The app automatically detects relations between notes in the same campaign via exact-name matching and renders them as connections on a memory map; the user can click a connection to navigate directly to the connected note.
- **Change ID:** auto-relations-memory-map
- **PRD refs:** FR-007, FR-009, FR-010, FR-011, US-01
- **Prerequisites:** S-01
- **Parallel with:** S-03, S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** This is the north star — placed as early as its one real prerequisite (S-01) allows, since it's the earliest point the core hypothesis can be tested against real notes. FR-011's no-manual-override constraint applies directly here: the map UI must never expose a way to hand-create or edit a relation.
- **Status:** proposed

### S-03: User can create and switch between multiple campaigns

- **Outcome:** User can explicitly create additional campaigns beyond the auto-created default, and switch between them; each campaign's notes and relations stay scoped to that campaign only.
- **Change ID:** multi-campaign-support
- **PRD refs:** FR-002 (explicit additional-campaign-creation part)
- **Prerequisites:** F-01
- **Parallel with:** S-01, S-02, S-04, S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Sequenced alongside the north star chain rather than blocking it — a single default campaign already exercises the full note+relation+map loop, so multi-campaign support doesn't reduce core-hypothesis risk and doesn't need to precede S-01/S-02.
- **Status:** proposed

### S-04: User can edit or delete a note and see relations update with a visible notice

- **Outcome:** User can edit a note's content (including its name) or delete it (behind an explicit confirmation step), and the app re-runs relation detection automatically, showing a visible notice of which relations were added or removed as a result — never a silent change.
- **Change ID:** note-edit-delete-relation-refresh
- **PRD refs:** FR-005, FR-006, FR-008
- **Prerequisites:** S-02
- **Parallel with:** S-03, S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Depends on S-02's relation-detection engine already existing — re-detection reuses that same engine, so building this after S-02 avoids duplicating the matching logic. This is also the PRD's secondary success criterion, so it's the first thing sequenced after the north star resolves.
- **Status:** proposed

### S-05: User can attach an image to a note

- **Outcome:** User can attach an image to a note alongside its text content.
- **Change ID:** note-image-attachment
- **PRD refs:** FR-004
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-03, S-04
- **Blockers:** —
- **Unknowns:**
  - Supabase Storage bucket policy (size limits, per-user access rules) for note images — Owner: team. Block: no.
- **Risk:** Nice-to-have and independent of the matching hypothesis — the PRD's own resolution on FR-004 notes images "don't feed the core domain rule" since exact-name matching only reads text, so this is sequenced last without blocking anything.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                         | Suggested issue title                                                      | Ready for `/10x-plan` | Notes                          |
| ---------- | ------------------------------------ | -------------------------------------------------------------------------------- | ----------------------- | --------------------------------- |
| F-01       | campaign-notes-schema               | Data foundation: campaigns/notes/relations schema + RLS + default campaign        | yes                     | —                                  |
| S-01       | create-notes                        | Add notes to a campaign                                                          | no                      | Blocked on F-01                    |
| S-02       | auto-relations-memory-map           | Auto-detected relations on a memory map, with navigation                          | no                      | Blocked on S-01                    |
| S-03       | multi-campaign-support              | Create and switch between multiple campaigns                                     | no                      | Blocked on F-01                    |
| S-04       | note-edit-delete-relation-refresh   | Edit/delete a note with visible relation-change notice                           | no                      | Blocked on S-02                    |
| S-05       | note-image-attachment               | Attach an image to a note                                                        | no                      | Blocked on S-01; nice-to-have      |

## Open Roadmap Questions

(None — the PRD's own `## Open Questions` section reports no open questions, and the interview resolved all sequencing-relevant anchors with strong Recommends.)

## Parked

- **Manual relation-setting or alias system** — Why parked: PRD Non-Goals — relations are exclusively the output of automatic exact-name matching (FR-011); a real alias system is a natural v2 feature, not a v1 shortcut.
- **Fuzzy/NLP-based relation matching** — Why parked: PRD Non-Goals — only exact-name string matching is used (FR-007), a deliberate MVP scope choice, not a placeholder for a "better" algorithm later.
- **Shared/collaborative campaigns** — Why parked: PRD Non-Goals — a campaign's notes are private to the owning account; no sharing between a GM and players, or between any two accounts, in v1.
- **Native mobile/desktop app** — Why parked: PRD Non-Goals — v1 ships as a web app only.

## Milestone History

(Empty — this is the first milestone.)

## Done

(Empty — `/10x-archive` appends an entry here when a change whose `Change ID` matches an item above is archived.)

- **F-01: (foundation) Campaigns, notes, and relations tables exist in Supabase with per-user RLS isolation; a default campaign is auto-created for a user at signup.** — Archived 2026-09-23 → `context/archive/2026-09-22-campaign-notes-schema/`. Lesson: —.
