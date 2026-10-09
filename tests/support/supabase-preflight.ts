/**
 * Shared preflight for suites that need local Supabase (integration, e2e).
 * Fails loudly instead of skipping, so CI can never pass by silently skipping a suite.
 */
export async function assertLocalSupabase(suite: string): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      `${suite} tests require SUPABASE_URL and SUPABASE_KEY. Copy .env.example to .env with local Supabase values.`,
    );
  }

  const host = new URL(supabaseUrl).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(
      `${suite} tests only run against local Supabase (127.0.0.1/localhost), got SUPABASE_URL host "${host}".`,
    );
  }

  const healthOk = await fetch(`${supabaseUrl}/auth/v1/health`, {
    headers: { apikey: supabaseKey },
  })
    .then((response) => response.ok)
    .catch(() => false);

  if (!healthOk) {
    throw new Error(`${suite} tests: local Supabase not running — run \`npx supabase start\`.`);
  }
}
