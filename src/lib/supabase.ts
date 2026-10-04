import { createClient } from "@supabase/supabase-js";
let browserDb: ReturnType<typeof createClient> | null = null;
export function createBrowserDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  if (typeof window === "undefined") return createClient(url, key);
  return browserDb ??= createClient(url, key);
}
