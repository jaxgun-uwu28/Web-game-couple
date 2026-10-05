import { createClient } from "@supabase/supabase-js";
import { isPrivateEmail } from "../private-auth";
export async function aiAuth(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !secret) throw new Error("AI_SETUP");
  const token = req.headers.get("authorization");
  if (!token?.startsWith("Bearer ")) throw new Error("AI_AUTH");
  const member = createClient(url, key, {
    global: { headers: { Authorization: token } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await member.auth.getUser(token.slice(7));
  if (error || !data.user || !isPrivateEmail(data.user.email))
    throw new Error("AI_AUTH");
  const { data: profile, error: pe } = await member
    .from("profiles")
    .select("couple_id")
    .eq("id", data.user.id)
    .single();
  if (pe || !profile) throw new Error("AI_AUTH");
  const admin = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { member, admin, coupleId: profile.couple_id as string };
}
export function aiError(e: unknown) {
  const message = e instanceof Error ? e.message : "";
  return Response.json(
    {
      error:
        message === "AI_AUTH"
          ? "Sign in with your private account."
          : "Saved questions could not load. Check the connection and try again.",
    },
    { status: message === "AI_AUTH" ? 401 : 503 },
  );
}
