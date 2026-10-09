import { assertLocalSupabase } from "../support/supabase-preflight";

/** Preflight for the e2e suite: the app degrades to "anonymous" without Supabase, so fail loudly instead. */
export default function globalSetup(): Promise<void> {
  return assertLocalSupabase("e2e");
}
