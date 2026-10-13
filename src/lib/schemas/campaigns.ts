import { z } from "zod";

import { MESSAGES, nameTooLong } from "@/lib/constants/messages";
import type { SaveCampaignCommand } from "@/types";

/**
 * Limit shared with the campaign create/rename form so client-side checks mirror this
 * exactly. Keep in sync with campaigns_name_check in
 * supabase/migrations/20260928120000_campaign_name_rules.sql.
 */
export const CAMPAIGN_NAME_MAX_LENGTH = 80;

/**
 * Validates both create and rename campaign bodies. `.strict()` rejects unknown
 * top-level keys — in particular `owner_id`, which must never be accepted from the
 * client.
 */
export const campaignNameSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, MESSAGES.NAME_REQUIRED)
      .max(CAMPAIGN_NAME_MAX_LENGTH, nameTooLong(CAMPAIGN_NAME_MAX_LENGTH)),
  })
  .strict();

export type CampaignNameInput = z.infer<typeof campaignNameSchema>;

// Compile-time check: the schema's inferred output must stay assignable to the shared DTO.
// (a type-only assertion, so it costs nothing at runtime and never goes "unused")
type _AssertAssignableToCommand<T extends SaveCampaignCommand> = T;
export type _SchemaMatchesCommand = _AssertAssignableToCommand<CampaignNameInput>;
