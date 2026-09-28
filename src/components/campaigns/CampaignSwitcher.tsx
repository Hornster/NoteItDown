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
 * campaignId is absent (e.g. on /campaigns/new) a disabled placeholder is shown instead
 * of a real selection.
 */
export default function CampaignSwitcher({ campaigns, campaignId, view }: Props) {
  return (
    <select
      aria-label="Switch campaign"
      value={campaignId ?? ""}
      disabled={!campaignId}
      onChange={(e) => {
        const targetId = e.target.value;
        if (targetId) {
          window.location.assign(campaignSwitchPath(view, targetId));
        }
      }}
      className="max-w-[10rem] truncate rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-xs text-white focus:ring-2 focus:ring-purple-400 focus:outline-none sm:max-w-[14rem] sm:text-sm"
    >
      {!campaignId && (
        <option value="" disabled className="bg-slate-800 text-white">
          Select a campaign…
        </option>
      )}
      {campaigns.map((campaign) => (
        <option key={campaign.id} value={campaign.id} className="bg-slate-800 text-white">
          {campaign.name}
        </option>
      ))}
    </select>
  );
}
