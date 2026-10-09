import { createClient, type PostgrestResponse, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Creates a throwaway signed-up user against local Supabase and returns a client
 * authenticated as that user, plus their id and auto-created campaign id.
 *
 * Relies on local email confirmations being off (same assumption as scripts/smoke.mjs):
 * signUp returns a session directly, with no separate signInWithPassword call.
 *
 * Auth rate-limit budget: local GoTrue allows 30 sign_in_sign_ups per 5 min per IP,
 * shared with the smoke step that runs right after in CI. Call this once per test file
 * (in beforeAll) per tenant, not once per test.
 */
export async function createTestUser(): Promise<{
  client: SupabaseClient;
  userId: string;
  campaignId: string;
  email: string;
  password: string;
}> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("SUPABASE_URL and SUPABASE_KEY must be set (see tests/support/supabase-preflight.ts).");
  }

  const client = createClient(supabaseUrl, supabaseKey);

  const email = `test-${crypto.randomUUID()}@example.com`;
  const password = "Test-Passw0rd!";

  const { data, error } = await client.auth.signUp({ email, password });
  if (error) {
    throw new Error(`createTestUser: signUp failed: ${error.message}`);
  }
  if (!data.session || !data.user) {
    throw new Error(
      "createTestUser: signUp returned no session. Local email confirmations must be disabled (see supabase/config.toml [auth.email] enable_confirmations).",
    );
  }

  const userId = data.user.id;

  const { data: campaigns, error: campaignError }: PostgrestResponse<{ id: string }> = await client
    .from("campaigns")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1);
  if (campaignError) {
    throw new Error(`createTestUser: failed to read auto-created campaign: ${campaignError.message}`);
  }
  const campaignId = campaigns[0]?.id;
  if (!campaignId) {
    throw new Error("createTestUser: no campaign was auto-created for the new user.");
  }

  return { client, userId, campaignId, email, password };
}
