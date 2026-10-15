import { Select } from "@/components/ui/select";
import { campaignSwitchPath, type CampaignView } from "@/lib/campaign-paths";
import type { CampaignSummary } from "@/types";

interface Props {
  campaigns: CampaignSummary[];
  campaignId?: string;
  view: CampaignView;
}

/**
 * Native <select> of the user's campaigns; the current one is selected, and picking
 * another one navigates to the equivalent view in it (campaignSwitchPath). When
 * campaignId is absent (e.g. on /campaigns/new) or not among the user's campaigns (a 404
 * page), a disabled placeholder option is selected so every campaign stays pickable.
 */
export default function CampaignSwitcher({ campaigns, campaignId, view }: Props) {
  const selected = campaigns.some((campaign) => campaign.id === campaignId) ? (campaignId ?? "") : "";

  return (
    <Select
      aria-label="Switch campaign"
      value={selected}
      onChange={(e) => {
        const targetId = e.target.value;
        if (targetId) {
          window.location.assign(campaignSwitchPath(view, targetId));
        }
      }}
      className="max-w-[10rem] truncate rounded-lg px-2 py-1 text-xs sm:max-w-[14rem] sm:text-sm"
    >
      {selected === "" && (
        <option value="" disabled>
          Select a campaign…
        </option>
      )}
      {campaigns.map((campaign) => (
        <option key={campaign.id} value={campaign.id}>
          {campaign.name}
        </option>
      ))}
    </Select>
  );
}
