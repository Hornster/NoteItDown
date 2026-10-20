import { expect, test } from "@playwright/test";

test("the signed-out landing page shows the NoteItDown copy and no starter text", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("NoteItDown");
  await expect(page.getByRole("heading", { level: 1, name: "NoteItDown" })).toBeVisible();
  await expect(page.getByText("A TTRPG notepad that makes relations managing and data recall easy.")).toBeVisible();

  const panels = [
    { name: "Make notes", text: "Note the NPC, note their quest and reference the NPC in the description." },
    {
      name: "Keep noting",
      text: "The references are updated automatically whenever you update, add or delete a note. Immediately.",
    },
    {
      name: "Recall",
      text: "Find where Boblin the Goblin lived through the interactive memory map with search capability.",
    },
  ];

  await expect(page.getByRole("heading", { level: 3 })).toHaveText(panels.map((p) => p.name));

  for (const { name, text } of panels) {
    const panel = page.getByRole("heading", { level: 3, name, exact: true }).locator("..");
    await expect(panel.getByText(text, { exact: true })).toBeVisible();
    await expect(panel.getByRole("link")).toHaveCount(0);
    await expect(panel.getByRole("button")).toHaveCount(0);
  }

  const body = page.locator("body");
  for (const gone of [
    "10x Astro Starter",
    "Authentication Ready",
    "Modern Stack",
    "Developer Experience",
    "production-ready starter",
  ]) {
    await expect(body).not.toContainText(gone);
  }
});
