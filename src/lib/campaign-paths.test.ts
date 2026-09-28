import { describe, expect, it } from "vitest";

import { campaignSwitchPath } from "./campaign-paths";

const TARGET = "550e8400-e29b-41d4-a716-446655440000";

describe("campaignSwitchPath", () => {
  it("maps notes to the notes list", () => {
    expect(campaignSwitchPath("notes", TARGET)).toBe(`/campaigns/${TARGET}`);
  });

  it("maps note to the notes list", () => {
    expect(campaignSwitchPath("note", TARGET)).toBe(`/campaigns/${TARGET}`);
  });

  it("maps none to the notes list", () => {
    expect(campaignSwitchPath("none", TARGET)).toBe(`/campaigns/${TARGET}`);
  });

  it("maps map to the map page", () => {
    expect(campaignSwitchPath("map", TARGET)).toBe(`/campaigns/${TARGET}/map`);
  });

  it("maps new-note to the create-note page", () => {
    expect(campaignSwitchPath("new-note", TARGET)).toBe(`/campaigns/${TARGET}/notes/new`);
  });

  it("maps edit to the edit page", () => {
    expect(campaignSwitchPath("edit", TARGET)).toBe(`/campaigns/${TARGET}/edit`);
  });
});
