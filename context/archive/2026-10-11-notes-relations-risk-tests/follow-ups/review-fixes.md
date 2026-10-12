# Review follow-ups: notes-relations-risk-tests

Deferred from `reviews/impl-review.md`. Pick these up in the next test-infra change.

## F6: Shared seeding helpers and fixtures

- Add an optional `content` argument to `createTestNote` (`tests/integration/helpers.ts`). Then replace `createNoteVia` in `tests/http/forged-id.test.ts:45-54` and the inline `create_note` RPC in `tests/e2e/notes-relations.spec.ts` with it.
- Move the shared image fixtures (`webpFixture`, `jpegFixture`) to `tests/support/`, so `tests/http/forged-id.test.ts` stops importing from `../integration/helpers`.
