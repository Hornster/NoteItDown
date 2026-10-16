import path from "node:path";
import { deflateSync } from "node:zlib";

import { expect, test as base, type Browser, type BrowserContext, type Page } from "@playwright/test";

import { createTestUser } from "../../support/test-user";
import { waitForHydration } from "../support/hydration";
import { createNoteViaUi, signInViaUi } from "../support/ui-flows";

// On-demand screenshot capture for the theme revamp (`npm run test:screenshots`), not part of the e2e suite.
// Output: .screenshots/theme/<SHOT_LABEL or "adhoc">/<key>.png, with stable keys so before/after pairs line up.
// Auth calls: 2 per run (1 signUp via createTestUser + 1 UI sign-in). A failing test restarts the worker and re-runs
// beforeAll, which costs two more auth calls per restart.
const LABEL = process.env.SHOT_LABEL ?? "adhoc";
const OUT_DIR = path.join(process.cwd(), ".screenshots", "theme", LABEL);

const KEEP_NAME = "Ironvale Keep";
const MENTIONER_NAME = "Captain Mirelle";

interface Seed {
  campaignId: string;
  keepId: string;
  storageState: Awaited<ReturnType<BrowserContext["storageState"]>>;
}

let seed: Seed | undefined;

function requireSeed(): Seed {
  if (!seed) throw new Error("theme screenshots: seeding did not run");
  return seed;
}

/** Signed-in page that reuses the session captured while seeding. */
const test = base.extend<{ signedInPage: Page }>({
  signedInPage: async ({ browser, baseURL }, provide) => {
    const context = await browser.newContext({
      baseURL,
      storageState: requireSeed().storageState,
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();
    await provide(page);
    await context.close();
  },
});

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A valid 64x64 RGB gradient PNG, generated in memory. */
function makePng(): Buffer {
  const size = 64;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: RGB
  const raw = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    const row = y * (1 + size * 3);
    for (let x = 0; x < size; x++) {
      raw[row + 1 + x * 3] = x * 4;
      raw[row + 2 + x * 3] = y * 4;
      raw[row + 3 + x * 3] = 160;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

async function seedCampaign(browser: Browser, baseURL: string | undefined): Promise<Seed> {
  const user = await createTestUser();
  const context = await browser.newContext({ baseURL });
  try {
    const page = await context.newPage();
    await signInViaUi(page, user);
    const keepId = await createNoteViaUi(
      page,
      user.campaignId,
      KEEP_NAME,
      "A crumbling fortress on the northern ridge.",
      { name: "keep.png", mimeType: "image/png", buffer: makePng() },
    );
    await createNoteViaUi(page, user.campaignId, MENTIONER_NAME, `Commands the garrison at ${KEEP_NAME}.`);
    return { campaignId: user.campaignId, keepId, storageState: await context.storageState() };
  } finally {
    await context.close();
  }
}

async function shoot(page: Page, key: string, options: { fullPage?: boolean } = {}) {
  await page.screenshot({
    path: path.join(OUT_DIR, `${key}.png`),
    fullPage: options.fullPage ?? true,
    animations: "disabled",
    caret: "hide",
  });
}

test.describe("signed out", () => {
  test("home", async ({ page }) => {
    await page.goto("/");
    await shoot(page, "home");
  });

  test("signin", async ({ page }) => {
    await page.goto("/auth/signin");
    await waitForHydration(page, "Sign in");
    await shoot(page, "signin");
  });

  test("signup", async ({ page }) => {
    await page.goto("/auth/signup");
    await waitForHydration(page, "Create account");
    await shoot(page, "signup");
  });

  test("confirm-email", async ({ page }) => {
    await page.goto("/auth/confirm-email");
    await shoot(page, "confirm-email");
  });

  test("licenses", async ({ page }) => {
    await page.goto("/licenses");
    await shoot(page, "licenses");
  });
});

test.describe("signed in", () => {
  // Scoped here so a seeding failure cannot take the signed-out shots down with it.
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    seed = await seedCampaign(browser, test.info().project.use.baseURL);
  });

  test("dashboard", async ({ signedInPage: page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(`/campaigns/${requireSeed().campaignId}`);
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
    // Expand one group so the shot shows note rows (S-06).
    await page.locator("astro-island:not([ssr])", { has: page.locator("button[aria-expanded]") }).waitFor();
    const firstGroup = page.locator("button[aria-expanded]").first();
    await firstGroup.click();
    await expect(firstGroup).toHaveAttribute("aria-expanded", "true");
    await shoot(page, "dashboard");
  });

  test("campaign-new", async ({ signedInPage: page }) => {
    await page.goto("/campaigns/new");
    await waitForHydration(page, "Create campaign");
    await shoot(page, "campaign-new");
  });

  test("campaign-edit", async ({ signedInPage: page }) => {
    await page.goto(`/campaigns/${requireSeed().campaignId}/edit`);
    await waitForHydration(page, "Save name");
    await shoot(page, "campaign-edit");
  });

  test("note-new", async ({ signedInPage: page }) => {
    await page.goto(`/campaigns/${requireSeed().campaignId}/notes/new`);
    await waitForHydration(page, "Create note");
    await shoot(page, "note-new");
  });

  test("note-view", async ({ signedInPage: page }) => {
    const { campaignId, keepId } = requireSeed();
    await page.goto(`/campaigns/${campaignId}/notes/${keepId}`);
    await waitForHydration(page, "Delete");
    await expect(page.locator("main img, astro-island img").first()).toBeVisible();
    await shoot(page, "note-view");
  });

  test("note-edit", async ({ signedInPage: page }) => {
    const { campaignId, keepId } = requireSeed();
    await page.goto(`/campaigns/${campaignId}/notes/${keepId}/edit`);
    await waitForHydration(page, "Save changes");
    await shoot(page, "note-edit");
  });

  test("note-saved-notice", async ({ signedInPage: page }) => {
    const { campaignId, keepId } = requireSeed();
    await page.goto(`/campaigns/${campaignId}/notes/${keepId}/edit`);
    await waitForHydration(page, "Save changes");
    await page.getByLabel("Content").fill(`A crumbling fortress on the northern ridge, held by ${MENTIONER_NAME}.`);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL(`/campaigns/${campaignId}/notes/${keepId}`);
    // The notice is one-shot (consumed from sessionStorage on render): shoot straight after the redirect.
    await expect(page.getByRole("status")).toBeVisible();
    await shoot(page, "note-saved-notice");
  });

  test("delete-dialog", async ({ signedInPage: page }) => {
    const { campaignId, keepId } = requireSeed();
    await page.goto(`/campaigns/${campaignId}/notes/${keepId}`);
    await waitForHydration(page, "Delete");
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    // Never confirmed: the seeded note must survive for the other shots.
    await shoot(page, "delete-dialog", { fullPage: false });
  });

  test("image-popup", async ({ signedInPage: page }) => {
    const { campaignId, keepId } = requireSeed();
    await page.goto(`/campaigns/${campaignId}/notes/${keepId}`);
    const island = page.locator('astro-island[component-url*="NoteImages"]:not([ssr])');
    await island.waitFor();
    await island.getByRole("button").first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("img")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Close" })).toBeVisible();
    await shoot(page, "image-popup", { fullPage: false });
  });

  test("map", async ({ signedInPage: page }) => {
    await page.goto(`/campaigns/${requireSeed().campaignId}/map`);
    // The map is client:only, so wait for the rendered graph instead of an island.
    await expect(page.locator(".react-flow__node")).toHaveCount(2);
    await expect(page.locator(".react-flow__edge")).toHaveCount(1);
    await expect(page.locator(".react-flow__edge").first()).toBeVisible();
    await shoot(page, "map");
  });

  test("header", async ({ signedInPage: page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
    await shoot(page, "header", { fullPage: false });
  });

  test("footer", async ({ signedInPage: page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
    await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
    await expect(page.getByRole("link", { name: /licen/i })).toBeInViewport();
    await shoot(page, "footer", { fullPage: false });
  });
});
