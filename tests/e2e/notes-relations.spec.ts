import { expect, test, type Locator, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { HTTP_STATUS } from "@/lib/constants/http-status";

import { createTestUser } from "../support/test-user";
import { waitForHydration } from "./support/hydration";
import { createNoteViaUi, signInViaUi } from "./support/ui-flows";

// Auth calls: 5 (CRUD test: 1 signUp via createTestUser + 1 UI signin; forged-URL test: 2 signUps + 1 UI signin).
// Relation-change notice wording approved by the user on 2026-10-11 in `/10x-plan` (notes-relations-risk-tests);
// changing it is a deliberate S-04 decision. Deliberately literal — never import the app's message dictionary; the
// oracle must not come from the code under test.
const UI_BASELINE = {
  saved: (name: string) => `Saved "${name}".`,
  relationsAdded: (names: string[]) => `Relations added: ${names.join(", ")}`,
  relationsRemoved: (names: string[]) => `Relations removed: ${names.join(", ")}`,
  relationsUnchanged: "Relations unchanged.",
  deleted: (name: string) => `Deleted "${name}".`,
  noRelationsTouched: "No relations touched.",
};

/** Opens the edit form of a note, applies the given changes, saves and waits for the note page. */
async function editNoteViaUi(
  page: Page,
  campaignId: string,
  noteId: string,
  changes: { content?: string; typeLabel?: string },
) {
  await page.goto(`/campaigns/${campaignId}/notes/${noteId}/edit`);
  await waitForHydration(page, "Save changes");
  if (changes.content !== undefined) await page.getByLabel("Content").fill(changes.content);
  if (changes.typeLabel !== undefined) await page.getByLabel("Type").selectOption({ label: changes.typeLabel });
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(`/campaigns/${campaignId}/notes/${noteId}`);
}

async function deleteNoteViaUi(page: Page, campaignId: string, noteId: string) {
  await page.goto(`/campaigns/${campaignId}/notes/${noteId}`);
  await waitForHydration(page, "Delete");
  await page.getByRole("button", { name: "Delete" }).click();
  // Cancel is the default-focused button, so a stray Enter cannot confirm the deletion.
  await expect(page.getByRole("alertdialog").getByRole("button", { name: "Cancel" })).toBeFocused();
  // The dialog has its own "Delete" confirm button; scope the click to it.
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(`/campaigns/${campaignId}`);
}

/** Asserts the notice has exactly these lines (full text each) and returns its <p> locators for link checks. */
async function expectNotice(page: Page, lines: string[]): Promise<Locator> {
  const paragraphs = page.getByRole("status").locator("p");
  await expect(paragraphs).toHaveCount(lines.length);
  for (const [i, line] of lines.entries()) {
    await expect(paragraphs.nth(i)).toHaveText(line);
  }
  return paragraphs;
}

/** Asserts the links in a notice line point at the given notes, in order. */
async function expectLinks(line: Locator, campaignId: string, ids: string[]) {
  const links = line.getByRole("link");
  await expect(links).toHaveCount(ids.length);
  for (const [i, id] of ids.entries()) {
    await expect(links.nth(i)).toHaveAttribute("href", `/campaigns/${campaignId}/notes/${id}`);
  }
}

test("note create, edit and delete through the UI show the approved relation notices", async ({ page }) => {
  // ~25 page loads plus form submissions exceed the 30 s default.
  test.setTimeout(120_000);

  const user = await createTestUser();
  const cid = user.campaignId;
  await signInViaUi(page, user);

  // Names share no word with each other or with any content except the edited note's own mentions.
  const BRASSWICK = "Brasswick";
  const QUILLMOOR = "Quillmoor";
  const ZEPHYR = "Zephyr Harbor";
  const LARKSPUR = "Larkspur Vale";

  const ids: Record<string, string> = {};

  await test.step("create notes through the form", async () => {
    for (const name of [BRASSWICK, QUILLMOOR, ZEPHYR, LARKSPUR]) {
      ids[name] = await createNoteViaUi(page, cid, name, "Plain text.");
    }
    await page.goto(`/campaigns/${cid}/notes/${ids[BRASSWICK]}`);
    await expect(page.getByText("Plain text.", { exact: true })).toBeVisible();
    // The notice island renders nothing (no button for waitForHydration), so wait for it to hydrate
    // before asserting that no notice appeared.
    await page.locator('astro-island[component-url*="RelationChangeNotice"]:not([ssr])').waitFor({ state: "attached" });
    await expect(page.getByRole("status")).toHaveCount(0);
  });

  await test.step("edit adding two mentions shows saved and added lines", async () => {
    await editNoteViaUi(page, cid, ids[BRASSWICK], { content: `Meets ${QUILLMOOR} and ${ZEPHYR}.` });
    const lines = await expectNotice(page, [
      UI_BASELINE.saved(BRASSWICK),
      UI_BASELINE.relationsAdded([QUILLMOOR, ZEPHYR]),
    ]);
    await expectLinks(lines.nth(1), cid, [ids[QUILLMOOR], ids[ZEPHYR]]);
    await expect(page.getByText(`Meets ${QUILLMOOR} and ${ZEPHYR}.`)).toBeVisible();
  });

  await test.step("edit removing a mention shows saved and removed lines", async () => {
    await editNoteViaUi(page, cid, ids[BRASSWICK], { content: `Meets ${ZEPHYR}.` });
    const lines = await expectNotice(page, [UI_BASELINE.saved(BRASSWICK), UI_BASELINE.relationsRemoved([QUILLMOOR])]);
    await expectLinks(lines.nth(1), cid, [ids[QUILLMOOR]]);
  });

  await test.step("edit adding one and removing another shows saved, added and removed lines", async () => {
    await editNoteViaUi(page, cid, ids[BRASSWICK], { content: `Meets ${LARKSPUR}.` });
    const lines = await expectNotice(page, [
      UI_BASELINE.saved(BRASSWICK),
      UI_BASELINE.relationsAdded([LARKSPUR]),
      UI_BASELINE.relationsRemoved([ZEPHYR]),
    ]);
    await expectLinks(lines.nth(1), cid, [ids[LARKSPUR]]);
    await expectLinks(lines.nth(2), cid, [ids[ZEPHYR]]);
  });

  await test.step("content-only edit with no relation change shows saved and unchanged", async () => {
    await editNoteViaUi(page, cid, ids[BRASSWICK], { content: `Meets ${LARKSPUR} again.` });
    await expectNotice(page, [UI_BASELINE.saved(BRASSWICK), UI_BASELINE.relationsUnchanged]);
  });

  await test.step("type-only edit shows only the saved line", async () => {
    await editNoteViaUi(page, cid, ids[BRASSWICK], { typeLabel: "Place" });
    await expectNotice(page, [UI_BASELINE.saved(BRASSWICK)]);
  });

  await test.step("map node click opens the note page", async () => {
    await page.goto(`/campaigns/${cid}/map`);
    // The map is client:only, so there is no SSR island to hydrate; wait for the rendered nodes instead.
    await page.locator(".react-flow__node").first().waitFor();
    await page.locator(".react-flow__node").filter({ hasText: LARKSPUR }).click();
    await expect(page).toHaveURL(`/campaigns/${cid}/notes/${ids[LARKSPUR]}`);
  });

  await test.step("delete a note with relations shows deleted and removed lines", async () => {
    await deleteNoteViaUi(page, cid, ids[BRASSWICK]);
    const lines = await expectNotice(page, [UI_BASELINE.deleted(BRASSWICK), UI_BASELINE.relationsRemoved([LARKSPUR])]);
    await expectLinks(lines.nth(1), cid, [ids[LARKSPUR]]);
  });

  await test.step("delete a note without relations shows deleted and no-relations lines", async () => {
    await deleteNoteViaUi(page, cid, ids[QUILLMOOR]);
    await expectNotice(page, [UI_BASELINE.deleted(QUILLMOOR), UI_BASELINE.noRelationsTouched]);
  });
});

test("a signed-in user opening another user's note URL gets a 404 without the note's data", async ({ page }) => {
  const RUN = crypto.randomUUID();
  const A_NOTE_NAME = `Forged-A-note-${RUN}`;
  const A_NOTE_CONTENT = `Forged-A-secret-content-${RUN}`;

  const a = await createTestUser();
  const b = await createTestUser();

  const client: SupabaseClient = a.client;
  const created = await client.rpc("create_note", {
    p_campaign_id: a.campaignId,
    p_name: A_NOTE_NAME,
    p_content: A_NOTE_CONTENT,
    p_new_type_name: "NPC",
  });
  if (created.error) throw new Error(`seed note failed: ${created.error.message}`);
  const noteAId = (created.data as { id: string }).id;

  await signInViaUi(page, b);
  // Session-only outcome first: proves B is really signed in, so the 404 below is isolation, not a degraded session.
  await expect(page).toHaveURL(`/campaigns/${b.campaignId}`);
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  const response = await page.goto(`/campaigns/${a.campaignId}/notes/${noteAId}`);
  expect(response?.status()).toBe(HTTP_STATUS.NOT_FOUND);
  await expect(page.getByText(A_NOTE_NAME)).toHaveCount(0);
  await expect(page.getByText(A_NOTE_CONTENT)).toHaveCount(0);
});
