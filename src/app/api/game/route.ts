import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
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
    auth: { persistSession: false },
  });
  const {
    data: { user },
    error: authError,
  } = await db.auth.getUser(token.slice(7));
  if (authError || !user)
    return NextResponse.json(
      { error: "Your invitation expired. Sign in again." },
      { status: 401 },
    );
  try {
    const body = await req.text();
    if (body.length > 4096)
      return NextResponse.json({ error: "Move too large." }, { status: 400 });
    const { id, action, kind } = JSON.parse(body);
    const { data, error } = await db.rpc(
      id ? "play_game" : "new_game",
      id ? { gid: id, action } : { k: kind },
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
