import { expect, test } from "@playwright/test";

import { createTestUser } from "../integration/helpers";

test("a seeded user signs in and lands on their own campaign", async ({ page }) => {
  // Exactly one user per run: local GoTrue's auth rate limit is shared with integration and smoke.
  const { email, password, campaignId } = await createTestUser();

  await page.goto("/auth/signin");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  // Both assertions are reachable only with a real session; an anonymous (degraded) visitor cannot satisfy them.
  await expect(page).toHaveURL(`/campaigns/${campaignId}`);
  await expect(page.getByRole("button", { name: /sign out/i })).toBeVisible();
});
