---
project: "NoteItDown"
version: 1
status: draft
created: 2026-09-16
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
---

# PRD: NoteItDown

## Vision & Problem Statement

A TTRPG participant — GM or player — running or playing in a Dungeons & Dragons campaign accumulates quests, NPCs, places, and observations session after session. As a campaign grows longer and more elaborate, the connections *between* those things become impossible to hold in memory or in flat notes: the knowledge is there, but it's trapped, unstructured, and un-navigable. Today this person keeps loose text notes (a doc, a notebook, a notes app); the relations between entries exist only in their own memory, so returning to old material to answer "who is connected to whom, and how" is slow and error-prone.

General-purpose note and wiki tools require every link between entries to be created manually. Over a long campaign nobody sustains that discipline consistently, so the web of connections decays even when the raw notes are still there. NoteItDown's insight is that campaign entities are named consistently enough (NPC names, place names, quest names) that a simple, heuristic, exact-name-match pass can surface likely relations automatically — without requiring the user to hand-build a link graph, and without needing complex NLP or inference.

## User & Persona

**Primary persona**: An individual TTRPG participant (GM or player) managing their own campaign notes solo. They may run or play in one or more campaigns, but each campaign's notes belong to and are visible only to them — this is not a shared/collaborative tool between a GM and their players, at least for v1. The product can be reached for at any moment in the campaign, though preferably at the beginning if the campaign is supposed to last longer than 3 sessions as this app will help organize the notes and ensure faster response whenever deeper notes study is required.

## Success Criteria

### Primary
- A user can sign up/log in, create a campaign, add multiple notes (NPCs/places/quests/observations, text + optional image), and see the app automatically detect relations between notes via exact-name matching.
- A user can view a simple memory map showing their notes and the detected connections between them, and navigate from the map back to individual notes.

### Secondary
- Editing or deleting a note automatically re-runs the heuristic match, so relations stay accurate without manual upkeep.

### Guardrails
- A user never sees another user's campaign data (cross-account data isolation).
- Uploaded images and notes are never lost or corrupted.
- The memory map stays readable as notes accumulate — it must not become an unreadable tangle as a campaign grows.

## User Stories

### US-01: User adds notes and sees them automatically connected on the memory map

- **Given** a logged-in user with a campaign containing at least one existing note (e.g. an NPC named "Bob the Blacksmith")
- **When** they create a new note whose text mentions that exact name (e.g. a Quest note reading "...Bob the Blacksmith asked me to retrieve his hammer...")
- **Then** the app automatically detects a relation between the two notes and the connection appears on the campaign's memory map, without any manual linking step

#### Acceptance Criteria
- Matching is exact-name only (case-insensitive and heuristic-based, no fuzzy/partial/NLP matching) — a partial or variant name does not create a relation.
- No relation is created if no note names appear verbatim in another note's text.
- The user can click the connected node on the map to navigate directly to that note.
- If the mentioned note is later renamed or deleted, the relation is re-evaluated (per FR-008) and the change is visibly surfaced to the user, not silent.

## Functional Requirements

### Campaigns & Access
- FR-001: User can sign up and log in to an account. Priority: must-have
  > Socrates: Counter-argument considered: "login adds friction for a quick-note hobby tool." Resolution: kept; login is required to keep each user's campaigns private, per Access Control.
- FR-002: A default campaign is automatically created for the user at signup; the user can also create additional campaigns explicitly. Priority: must-have
  > Socrates: Counter-argument considered: "forcing an explicit 'create campaign' step before any note-taking is friction with no payoff for single-campaign users." Resolution: revised — auto-create a default campaign at signup, but keep explicit creation available for users who run more than one.

### Notes
- FR-003: User can create a note using one of the predefined types (NPC, Place, Quest, Observation) or a custom, campaign-unique type name, plus plain text content. Priority: must-have
  > Socrates: Counter-argument considered: "a fixed type list is too rigid — real campaigns have things that don't fit neatly." Resolution: revised — predefined types cover the common cases, but the user can also define their own type name (unique within the campaign) for anything that doesn't fit.
- FR-004: User can attach an image to a note. Priority: nice-to-have
  > Socrates: Counter-argument considered: "images don't feed the core domain rule (exact-name matching only reads text) and could be deferred to v2 without weakening the MVP's proof point." Resolution: demoted to nice-to-have — kept in scope since the original idea calls for it, but not required to prove the MVP works.
- FR-005: User can edit a note's content, including its name. Priority: must-have
  > Socrates: Counter-argument considered: "DnD names are easy to mistype, and users will edit note names to fix mistakes; since relations are already established, the app should propagate a rename rather than let the relation silently break." Resolution: kept, and merged into FR-008 — editing a note (including renames) must re-run relation detection and surface what changed. See FR-008.
- FR-006: User can delete a note. Deletion requires an explicit confirmation step before removal. Priority: must-have
  > Socrates: Counter-argument considered: "deleting a referenced note could leave dangling relations elsewhere, and accidental deletion risks permanent data loss." Resolution: kept, with an added confirmation step before delete completes — addresses accidental loss; dangling relations are handled by FR-008's re-detection on delete.

### Relations & Memory Map
- FR-007: App automatically detects relations between notes via exact-name matching (e.g., one note's text contains another note's exact name). Priority: must-have
  > Socrates: Counter-argument considered: "exact-name matching produces false negatives (name variants like 'Bob' vs 'Bob the Blacksmith' won't link) and false positives (a note named 'Inn' could match the word 'inn' incidentally)." Resolution: kept as written — heuristic, exact-name-only matching was the deliberate scope choice in the original idea; no fuzzy/NLP matching in the MVP.
- FR-008: Editing or deleting a note automatically re-runs relation detection, so the map stays accurate without manual upkeep. After re-detection, the user is shown what relations were added or removed as a result of the edit — changes are never silent. Priority: must-have
  > Socrates: Counter-argument considered: "relations silently appearing or disappearing after an edit could confuse the user, since it isn't obvious the map changed or why." Resolution: revised and promoted to must-have — re-detection must surface a visible notice of what changed, not happen invisibly.
- FR-009: User can view a memory map showing their notes and the relations automatically detected between them. Priority: must-have
  > Socrates: Counter-argument considered: "a graph/map visualization is nontrivial UI work — a simple 'related notes' list per note might prove the same value with far less effort." Resolution: kept; the memory map is the product's core payoff per the original idea, not an incidental feature.
- FR-010: User can navigate from the memory map to an individual note. Priority: must-have
  > Socrates: Counter-argument considered: "this is standard interaction for any graph UI and might not need to be its own FR separate from FR-009." Resolution: kept as a separate FR — it's the step that makes the map actually useful for "ease of travel around accumulated data," per the original idea, not just a passive visualization.
- FR-011: User cannot manually create, edit, or override a relation between two notes — relations are exclusively the output of automatic exact-name matching in the MVP. Priority: must-have
  > Scope note: manual relation-setting is deliberately excluded, not deferred by oversight. Letting a user manually declare "these two names refer to the same thing" without a real alias system would create a false impression that the app remembers and generalizes that equivalence — it wouldn't. Manual relations plus a proper alias system are a natural, connected v2 feature, not a v1 shortcut.
  > Socrates: Counter-argument considered: "with no way to dismiss a wrong auto-detected relation (per FR-007's known false-positive risk) or capture real domain knowledge the app can't infer, the user is stuck with an incomplete or occasionally wrong map." Resolution: kept as written — this is an accepted MVP limitation, not a gap; addressing it (dismissal, manual links, aliases) is explicitly the connected v2 feature named in the scope note above.

## Non-Functional Requirements

- A user sees their note saved, and the memory map reflecting it, within a short, perceptible delay after creating or editing a note — no long unexplained waits.
- Notes and their attached images persist reliably for the life of a campaign (which may run months or years) — no expiration, silent degradation, or requirement for the user to manually back up their data.

## Business Logic

The app classifies a pair of notes as related whenever one note's text contains another note's exact name.

The rule consumes two user-facing inputs, both already produced by ordinary note-taking: the name of each note within a campaign, and the plain-text content of every other note in that same campaign. It requires no extra input step from the user — the user never explicitly links anything, per FR-011.

The rule's output is a set of detected relations between notes, scoped to a single campaign (relations never cross campaigns, consistent with the per-user, per-campaign data isolation established in Access Control). Each relation simply marks that note A and note B are connected because A's name appears in B's text (or vice versa).

The user encounters this rule in two places: on the memory map, where detected relations render as connections between notes; and as a visible add/removed-relations notice whenever they edit or delete a note and the rule re-runs (FR-008), so the effect of the rule is never invisible to them.

## Access Control

Login required to use the app; the exact authentication mechanism is a downstream stack decision. Flat role model: every account is the same kind of user — an owner of their own campaigns. No admin/member distinction, no roles within a campaign, and no cross-account sharing. A user's campaigns and notes are visible only to that user.

## Non-Goals

- **No manual relation-setting or alias system.** Relations are exclusively the output of automatic exact-name matching (FR-011). Letting users manually declare two names equivalent without a real alias system would falsely imply the app generalizes that equivalence. Natural v2 feature, not a v1 shortcut.
- **No fuzzy/NLP-based relation matching.** Only exact-name string matching is used to detect relations (FR-007) — no similarity scoring, no language-model inference. A deliberate scope choice from the original idea, not a placeholder for a "better" algorithm later.
- **No shared/collaborative campaigns.** A campaign's notes are private to the account that owns them; there's no sharing between a GM and their players, or between any two accounts, in v1 (Access Control).
- **No native mobile/desktop app.** V1 ships as a web app only; no dedicated iOS/Android/desktop client.

## Open Questions

No open questions — shape-notes.md's quality cross-check (Step 7 of `/10x-shape`) confirmed all required elements present with no gaps: Access Control, Business Logic, Non-Goals, and timeline-cost were each checked and found complete.
