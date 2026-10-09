import { assertLocalSupabase } from "../support/supabase-preflight";

/**
 * Preflight checks for the integration suite. Runs once before any integration test file.
 * Fails loudly instead of skipping, so CI can never pass by silently skipping the suite.
 */
export default function globalSetup(): Promise<void> {
  return assertLocalSupabase("Integration");
}
