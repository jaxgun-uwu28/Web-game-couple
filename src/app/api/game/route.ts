import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isPrivateEmail } from "@/lib/private-auth";
import { aiAuth } from "@/lib/ai/auth";
import { startPartyGame } from "@/lib/ai/party-games";
export const maxDuration = 20;
export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    return NextResponse.json(
      { error: "The arcade connection is not configured." },
      { status: 503 },
    );
  const token = req.headers.get("authorization");
  if (!token?.startsWith("Bearer "))
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const db = createClient(url, key, {
    global: { headers: { Authorization: token } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const {
    data: { user },
    error: authError,
  } = await db.auth.getUser(token.slice(7));
  if (authError || !user)
    return NextResponse.json(
      {
        error:
          authError && (!authError.status || authError.status >= 500)
            ? "Supabase sign-in verification is unavailable. Try again shortly."
            : "Your session could not be verified. Sign out, then sign in again.",
      },
      {
        status:
          authError && (!authError.status || authError.status >= 500)
            ? 503
            : 401,
      },
    );
  if (!isPrivateEmail(user.email))
    return NextResponse.json(
      { error: "Only the two private accounts can play." },
      { status: 403 },
    );
  try {
    const body = await req.text();
    if (body.length > 4096)
      return NextResponse.json({ error: "Move too large." }, { status: 400 });
    const {
      id,
      action,
      kind,
      duration,
      heartblast,
      config,
      topic,
      count,
      difficulty,
      savedOnly,
    } = JSON.parse(body);
    if ((kind === "know" || kind === "draw") && !id) {
      try {
        const { admin, coupleId } = await aiAuth(req);
        return NextResponse.json(await startPartyGame(admin, coupleId, kind));
      } catch (e) {
        return NextResponse.json(
          {
            error:
              e instanceof Error ? e.message : "Game content could not load.",
          },
          { status: 503 },
        );
      }
    }
    if (kind === "trivia" && !id) {
      return NextResponse.json(
        { error: "Join the Brain Duel lobby first." },
        { status: 400 },
      );
    }
    const { data, error } = await db.rpc(
      kind === "block"
        ? heartblast
          ? id
            ? "heartblast_battle"
            : "start_heartblast"
          : id
            ? "block_battle"
            : "start_block_battle"
        : id
          ? "play_game"
          : "new_game",
      kind === "block"
        ? heartblast
          ? id
            ? { gid: id, action }
            : { config }
          : id
            ? { gid: id, action }
            : { seconds: duration }
        : id
          ? { gid: id, action }
          : { k: kind },
    );
    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Invalid game request." },
      { status: 400 },
    );
  }
}
