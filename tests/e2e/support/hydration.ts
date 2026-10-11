import type { Page } from "@playwright/test";

// Wait for the island to hydrate; filling the SSR inputs earlier gets wiped by React's controlled state.
export async function waitForHydration(page: Page, buttonName: string) {
  await page.locator("astro-island:not([ssr])", { has: page.getByRole("button", { name: buttonName }) }).waitFor();
}
