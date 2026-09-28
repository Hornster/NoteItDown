/**
 * The kind of page a campaign-scoped view currently is, for the campaign switcher's
 * "land on the equivalent view in the other campaign" rule.
 */
export type CampaignView = "notes" | "map" | "new-note" | "note" | "edit" | "none";

/**
 * Maps the current view to the equivalent URL in another campaign. `notes`, `note` and
 * `none` all fall back to the target campaign's notes list — a note detail page has no
 * equivalent note in another campaign, so it lands on the list instead of guessing an id.
 */
export function campaignSwitchPath(view: CampaignView, targetCampaignId: string): string {
  switch (view) {
    case "map":
      return `/campaigns/${targetCampaignId}/map`;
    case "new-note":
      return `/campaigns/${targetCampaignId}/notes/new`;
    case "edit":
      return `/campaigns/${targetCampaignId}/edit`;
    case "notes":
    case "note":
    case "none":
      return `/campaigns/${targetCampaignId}`;
  }
}
