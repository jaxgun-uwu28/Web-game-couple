import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Channel topics are deduplicated per client. Keep the game's private channel
// separate from the mounted arcade's channel without changing its RLS topic.
export function pluginRealtimeClient(db: SupabaseClient) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      accessToken: async () => (await db.auth.getSession()).data.session?.access_token || null,
    },
  );
}
