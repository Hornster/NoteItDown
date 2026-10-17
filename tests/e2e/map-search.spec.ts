import { expect, test, type Page } from "@playwright/test";

import { createTestUser } from "../support/test-user";
import { signInViaUi } from "./support/ui-flows";

// Auth calls: 2 (1 signUp via createTestUser + 1 UI signin). Notes are seeded through the test user's Supabase client.
// Expected texts are deliberately literal — never import the app's message dictionary; the oracle must not come from
// the code under test.
const NO_NOTES_FOUND = "No notes found.";
const SEARCH_LABEL = "Search notes by name";

// "zanthor" matches exactly one note, "ravenmoor" three; the rest only add spread so centering is observable.
const SEEDS = [
  { type: "NPC", name: "Zanthor the Unique" },
  { type: "Place", name: "Ravenmoor Keep" },
  { type: "Place", name: "Ravenmoor Bridge" },
  { type: "Place", name: "Ravenmoor Inn" },
  { type: "Place", name: "Cinderfall" },
  { type: "Place", name: "Brindlemoor" },
  { type: "NPC", name: "Aldric Vane" },
  { type: "NPC", name: "Bram Hollowell" },
  { type: "Quest", name: "Ashen Pact" },
  { type: "Quest", name: "Moonwell Rescue" },
];

/** Max distance (px) between a node's center and the canvas center to count as centered. */
const CENTER_TOLERANCE = 12;

const CANVAS = ".react-flow";
const FOUND = '[data-found="true"]';

async function canvasBox(page: Page) {
  const box = await page.locator(CANVAS).boundingBox();
  if (!box) throw new Error("map canvas has no bounding box");
  return box;
}

/** Distance between the center of the (single) found node and the canvas center; Infinity until measurable. */
async function foundNodeOffset(page: Page): Promise<number> {
  const node = await page.locator(FOUND).first().boundingBox();
  if (!node) return Infinity;
  const canvas = await canvasBox(page);
  return Math.hypot(
    node.x + node.width / 2 - (canvas.x + canvas.width / 2),
    node.y + node.height / 2 - (canvas.y + canvas.height / 2),
  );
}

async function expectFoundNodeCentered(page: Page) {
  await expect.poll(() => foundNodeOffset(page)).toBeLessThanOrEqual(CENTER_TOLERANCE);
}

async function viewportTransform(page: Page): Promise<string> {
  return page.locator(".react-flow__viewport").evaluate((el) => (el as HTMLElement).style.transform);
}

/** Reads the viewport transform once two reads 150 ms apart agree (i.e. any animation has finished). */
async function settledTransform(page: Page): Promise<string> {
  let result = "";
  await expect
    .poll(async () => {
      const first = await viewportTransform(page);
      await page.waitForTimeout(150);
      const second = await viewportTransform(page);
      result = second;
      return first === second;
    })
    .toBe(true);
  return result;
}

/** Drags the canvas background by (dx, dy) starting from a point that is verifiably the empty pane. */
async function panPaneAway(page: Page, dx: number, dy: number) {
  await page.locator(CANVAS).scrollIntoViewIfNeeded();
  const box = await canvasBox(page);
  const start = await page.evaluate(({ x, y, width, height }) => {
    for (const fx of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      for (const fy of [0.1, 0.3, 0.5, 0.7, 0.9]) {
        const px = x + width * fx;
        const py = y + height * fy;
        const hit = document.elementFromPoint(px, py);
        if (hit?.classList.contains("react-flow__pane")) return { x: px, y: py };
      }
    }
    return null;
  }, box);
  if (!start) throw new Error("no empty pane area found to drag");
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + dx, start.y + dy, { steps: 10 });
  await page.mouse.up();
}

test("map search marks and frames matches, leaves the view on no match and survives back navigation", async ({
  page,
}) => {
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
  await page.goto(`/campaigns/${cid}/map`);
  // The map is client:only, so there is no SSR island to hydrate; wait for the rendered nodes instead.
  await expect(page.locator(".react-flow__node")).toHaveCount(SEEDS.length);
  const search = page.getByLabel(SEARCH_LABEL);

  await test.step("a single match via Enter is marked alone and centered; Enter again re-centers after a pan", async () => {
    await search.fill("zanthor");
    await search.press("Enter");
    await expect(page.locator(FOUND)).toHaveCount(1);
    await expect(page.locator(FOUND)).toContainText("Zanthor the Unique");
    await expectFoundNodeCentered(page);

    await panPaneAway(page, 160, 90);
    await expect.poll(() => foundNodeOffset(page)).toBeGreaterThan(CENTER_TOLERANCE * 2);

    await search.press("Enter");
    await expectFoundNodeCentered(page);
  });

  await test.step("several matches via typing and pausing are the only ones marked and all in view", async () => {
    await search.fill("ravenmoor");
    // No Enter: the debounce alone must apply it (expect polling covers the pause).
    await expect(page.locator(FOUND)).toHaveCount(3);
    for (const name of ["Ravenmoor Keep", "Ravenmoor Bridge", "Ravenmoor Inn"]) {
      await expect(page.locator(FOUND).filter({ hasText: name })).toHaveCount(1);
    }
    await expect
      .poll(async () => {
        const canvas = await canvasBox(page);
        for (const node of await page.locator(FOUND).all()) {
          const box = await node.boundingBox();
          if (!box) return false;
          const inside =
            box.x >= canvas.x &&
            box.y >= canvas.y &&
            box.x + box.width <= canvas.x + canvas.width &&
            box.y + box.height <= canvas.y + canvas.height;
          if (!inside) return false;
        }
        return true;
      })
      .toBe(true);
  });

  await test.step("no match via blur shows the message, marks nothing and keeps the viewport", async () => {
    const before = await settledTransform(page);

    await search.fill("zzzq");
    await search.blur();
    await expect(page.getByText(NO_NOTES_FOUND, { exact: true })).toBeVisible();
    await expect(page.locator(FOUND)).toHaveCount(0);
    // Short settle: a (wrong) viewport move would be an animation of about 300 ms.
    await page.waitForTimeout(500);
    expect(await viewportTransform(page)).toBe(before);
  });

  await test.step("clicking a found node opens the note; back restores query, marking and centering", async () => {
    await search.fill("zanthor");
    await search.press("Enter");
    await expect(page.locator(FOUND)).toHaveCount(1);
    await expect(page.getByText(NO_NOTES_FOUND, { exact: true })).toHaveCount(0);
    await expectFoundNodeCentered(page);

    await page.locator(FOUND).click();
    await expect(page).toHaveURL(new RegExp(`/campaigns/${cid}/notes/[0-9a-f-]{36}$`));
    await expect(page.getByRole("heading", { name: "Zanthor the Unique" })).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/[?&]q=zanthor$/);
    await expect(page.locator(".react-flow__node")).toHaveCount(SEEDS.length);
    await expect(page.getByLabel(SEARCH_LABEL)).toHaveValue("zanthor");
    await expect(page.locator(FOUND)).toHaveCount(1);
    await expect(page.locator(FOUND)).toContainText("Zanthor the Unique");
    await expectFoundNodeCentered(page);
  });
});
