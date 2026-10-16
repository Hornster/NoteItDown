import { expect, test, type Page } from "@playwright/test";

import { createTestUser } from "../support/test-user";
import { waitForHydration } from "./support/hydration";
import { signInViaUi } from "./support/ui-flows";

// Auth calls: 2 (1 signUp via createTestUser + 1 UI signin). Notes are seeded through the test user's Supabase client.
// Expected texts are deliberately literal — never import the app's message dictionary; the oracle must not come from
// the code under test.
const NO_NOTES_FOUND = "No notes found.";
const SEARCH_LABEL = "Search notes by name";

// Predefined types (NPC, Place, Quest); Observation stays empty and so must never show up as a group.
const SEEDS = [
  { type: "Quest", name: "Moonwell Rescue" },
  { type: "NPC", name: "Bram Hollowell" },
  { type: "Place", name: "Cinderfall" },
  { type: "NPC", name: "Aldric Vane" },
  { type: "Place", name: "Brindlemoor" },
  { type: "Quest", name: "Ashen Pact" },
];

/** Group header buttons in page order; a header's accessible name is "<type> <count>". */
function groupHeaders(page: Page) {
  return page.locator("button[aria-expanded]");
}

function group(page: Page, typeName: string) {
  return page.getByRole("button", { name: typeName });
}

/** The notes panel a group header controls (via its aria-controls id; React ids contain colons, hence [id=]). */
async function groupPanel(page: Page, typeName: string) {
  const panelId = await group(page, typeName).getAttribute("aria-controls");
  if (!panelId) throw new Error(`group "${typeName}" has no aria-controls`);
  return page.locator(`[id="${panelId}"]`);
}

function noteLink(page: Page, name: string) {
  return page.getByRole("link", { name });
}

test("dashboard groups notes by type and searches by name with restorable state", async ({ page }) => {
  test.setTimeout(60_000);

  const user = await createTestUser();
  const cid = user.campaignId;

  for (const seed of SEEDS) {
    const created = await user.client.rpc("create_note", {
      p_campaign_id: cid,
      p_name: seed.name,
      p_content: "Plain text.",
      p_new_type_name: seed.type,
    });
    if (created.error) throw new Error(`seed note "${seed.name}" failed: ${created.error.message}`);
  }

  await signInViaUi(page, user);
  // Hooked on a group header; "Quest" appears in no other button on the page.
  await waitForHydration(page, "Quest");
  const search = page.getByLabel(SEARCH_LABEL);

  await test.step("groups are visible, collapsed and sorted A-Z", async () => {
    await expect(groupHeaders(page)).toHaveText([/^NPC\s*2$/, /^Place\s*2$/, /^Quest\s*2$/]);
    for (const typeName of ["NPC", "Place", "Quest"]) {
      await expect(group(page, typeName)).toHaveAttribute("aria-expanded", "false");
    }
    await expect(noteLink(page, "Aldric Vane")).toBeHidden();
  });

  await test.step("expanding a group shows its notes A-Z", async () => {
    await group(page, "NPC").click();
    await expect(group(page, "NPC")).toHaveAttribute("aria-expanded", "true");
    await expect(noteLink(page, "Aldric Vane")).toBeVisible();
    await expect(noteLink(page, "Bram Hollowell")).toBeVisible();
    await expect((await groupPanel(page, "NPC")).getByRole("link")).toHaveText(["Aldric Vane", "Bram Hollowell"]);
  });

  await test.step("a partial lower-case query plus Enter narrows to matching groups, expanded, and sets ?q=", async () => {
    await search.fill("mo");
    await search.press("Enter");
    await expect(page).toHaveURL(/[?&]q=mo$/);
    await expect(groupHeaders(page)).toHaveText([/^Place\s*1$/, /^Quest\s*1$/]);
    await expect(group(page, "Place")).toHaveAttribute("aria-expanded", "true");
    await expect(group(page, "Quest")).toHaveAttribute("aria-expanded", "true");
    await expect(noteLink(page, "Brindlemoor")).toBeVisible();
    await expect(noteLink(page, "Moonwell Rescue")).toBeVisible();
    await expect(noteLink(page, "Cinderfall")).toHaveCount(0);
    await expect(noteLink(page, "Aldric Vane")).toHaveCount(0);
  });

  await test.step("a non-matching query shows the empty message after the debounce", async () => {
    await search.fill("zzzq");
    // No Enter: the debounce alone must apply it (expect polling covers the pause).
    await expect(page.getByText(NO_NOTES_FOUND, { exact: true })).toBeVisible();
    await expect(groupHeaders(page)).toHaveCount(0);
  });

  await test.step("clearing the search restores the hand-opened group only", async () => {
    await search.fill("");
    await search.press("Enter");
    await expect(page).not.toHaveURL(/[?&]q=/);
    await expect(page.getByText(NO_NOTES_FOUND, { exact: true })).toHaveCount(0);
    await expect(groupHeaders(page)).toHaveCount(3);
    await expect(group(page, "NPC")).toHaveAttribute("aria-expanded", "true");
    await expect(group(page, "Place")).toHaveAttribute("aria-expanded", "false");
    await expect(group(page, "Quest")).toHaveAttribute("aria-expanded", "false");
  });

  await test.step("back from a matching note restores the query, results and the hand-opened group", async () => {
    await search.fill("mo");
    await search.press("Enter");
    await expect(page).toHaveURL(/[?&]q=mo$/);
    await noteLink(page, "Moonwell Rescue").click();
    await expect(page).toHaveURL(new RegExp(`/campaigns/${cid}/notes/[0-9a-f-]{36}$`));
    await expect(page.getByRole("heading", { name: "Moonwell Rescue" })).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/[?&]q=mo$/);
    await waitForHydration(page, "Quest");
    await expect(search).toHaveValue("mo");
    await expect(groupHeaders(page)).toHaveText([/^Place\s*1$/, /^Quest\s*1$/]);
    await expect(noteLink(page, "Moonwell Rescue")).toBeVisible();

    await search.fill("");
    await search.press("Enter");
    await expect(page).not.toHaveURL(/[?&]q=/);
    await expect(groupHeaders(page)).toHaveCount(3);
    await expect(group(page, "NPC")).toHaveAttribute("aria-expanded", "true");
    await expect(noteLink(page, "Aldric Vane")).toBeVisible();
  });
});
