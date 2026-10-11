import { expect, test } from "@playwright/test";

import { createTestUser } from "../support/test-user";
import { waitForHydration } from "./support/hydration";

// UI baseline approved by the user on 2026-10-11 (auth-risk-tests Progress 3.3, 3.4); changing it is a deliberate wording
// decision (S-04). Deliberately literal — never import from `MESSAGES`; the oracle must not come from the code under test.
const UI_BASELINE = {
  signinInvalidCredentials: "Invalid login credentials",
  // characterizes known S-04 defect (account enumeration via raw Supabase message); expected to change in S-04
  signupDuplicateEmail: "User already registered",
};

const CAMPAIGN_URL = /\/campaigns\/[0-9a-f-]{36}$/;

test("signup, signin, protected page and signout form one working session chain", async ({ page, context }) => {
  // Auth calls: 2 (signup + signin); signout is not in the sign-in/sign-up rate bucket. Unique email, no seeded user.
  const email = `e2e-${crypto.randomUUID()}@example.com`;
  const password = "Test-Passw0rd!";

  await page.goto("/auth/signup");
  await waitForHydration(page, "Create account");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL("/auth/confirm-email");

  // Local confirmations are off, so signup already set session cookies; drop them so signin must create the session.
  await context.clearCookies();

  await page.goto("/auth/signin");
  await waitForHydration(page, "Sign in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  // Reachable only with a real session; an anonymous (degraded) visitor cannot satisfy both.
  await expect(page).toHaveURL(CAMPAIGN_URL);
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  const campaignUrl = page.url();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/");

  await page.goto("/dashboard");
  await expect(page).toHaveURL("/auth/signin");
  await page.goto(campaignUrl);
  await expect(page).toHaveURL("/auth/signin");
});

test.describe("approved error wording", () => {
  // One seeded user for both scenarios: 1 auth call here + 1 per scenario (local GoTrue rate limit is shared).
  let seeded: Awaited<ReturnType<typeof createTestUser>>;

  test.beforeAll(async () => {
    seeded = await createTestUser();
  });

  test("wrong password on signin shows the approved message", async ({ page }) => {
    await page.goto("/auth/signin");
    await waitForHydration(page, "Sign in");
    await page.getByLabel("Email").fill(seeded.email);
    await page.getByLabel("Password", { exact: true }).fill(`${seeded.password}-wrong`);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/auth\/signin\?error=/);
    // Located by text, not class/role: the server error is a bare <p> that S-05 restyles.
    await expect(page.getByText(UI_BASELINE.signinInvalidCredentials, { exact: true })).toBeVisible();
  });

  test("signup with an existing email shows the approved message", async ({ page }) => {
    await page.goto("/auth/signup");
    await waitForHydration(page, "Create account");
    await page.getByLabel("Email").fill(seeded.email);
    await page.getByLabel("Password", { exact: true }).fill(seeded.password);
    await page.getByLabel("Confirm password").fill(seeded.password);
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page).toHaveURL(/\/auth\/signup\?error=/);
    await expect(page.getByText(UI_BASELINE.signupDuplicateEmail, { exact: true })).toBeVisible();
  });
});
