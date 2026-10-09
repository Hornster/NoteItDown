import { expect, test } from "@playwright/test";

import { createTestUser } from "../support/test-user";

test("a seeded user signs in and lands on their own campaign", async ({ page }) => {
  // Exactly one user per run: local GoTrue's auth rate limit is shared with integration and smoke.
  const { email, password, campaignId } = await createTestUser();

  await page.goto("/auth/signin");
  // Wait for the signin island to hydrate; filling the SSR inputs earlier gets wiped by React's controlled state.
  await page.locator("astro-island:not([ssr])", { has: page.getByRole("button", { name: "Sign in" }) }).waitFor();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  // Both assertions are reachable only with a real session; an anonymous (degraded) visitor cannot satisfy them.
  await expect(page).toHaveURL(`/campaigns/${campaignId}`);
  await expect(page.getByRole("button", { name: /sign out/i })).toBeVisible();
});
