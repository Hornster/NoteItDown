import { expect, type Page } from "@playwright/test";

import { waitForHydration } from "./hydration";

const NOTE_URL = /\/campaigns\/[0-9a-f-]{36}\/notes\/([0-9a-f-]{36})$/;

/** Signs in through the form and waits for the user's own campaign page. */
export async function signInViaUi(page: Page, user: { email: string; password: string; campaignId: string }) {
  await page.goto("/auth/signin");
  await waitForHydration(page, "Sign in");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(`/campaigns/${user.campaignId}`);
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

/** Creates a note through the UI form (optionally with an image) and returns its id (taken from the URL it lands on). */
export async function createNoteViaUi(
  page: Page,
  campaignId: string,
  name: string,
  content: string,
  image?: { name: string; mimeType: string; buffer: Buffer },
): Promise<string> {
  await page.goto(`/campaigns/${campaignId}/notes/new`);
  await waitForHydration(page, "Create note");
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Content").fill(content);
  if (image) {
    await page.locator("#images").setInputFiles(image);
    // The picker processes the file client-side; the blob preview appears once it is ready to upload.
    await expect(page.locator('form img[src^="blob:"]')).toBeVisible();
  }
  await page.getByRole("button", { name: "Create note" }).click();
  await expect(page).toHaveURL(NOTE_URL);
  const id = NOTE_URL.exec(page.url())?.[1];
  if (!id) throw new Error(`could not read the id of "${name}" from ${page.url()}`);
  await expect(page.getByRole("heading", { name })).toBeVisible();
  return id;
}
