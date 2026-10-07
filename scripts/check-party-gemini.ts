import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { startPartyGame, cleanPartyItems } from "../src/lib/ai/party-games";
import { requestGemini, defaultModel } from "../src/lib/ai/gemini";
async function main() {
  loadEnvConfig(process.cwd());
  if (!process.argv.includes("--live"))
    throw new Error("Explicit --live is required. Maximum two requests.");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY,
    gemini = process.env.GEMINI_API_KEY;
  if (!url || !key || !gemini)
    throw new Error("Server Gemini/Supabase configuration is missing.");
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const profile = await admin
    .from("profiles")
    .select("couple_id")
    .limit(1)
    .single();
  if (profile.error) throw new Error("Could not load linked couple.");
  const c = profile.data.couple_id;
  let requests = 0;
  for (const kind of ["know", "draw"] as const) {
    let firstContext = true,
      count = 0;
    // Force generation without consuming saved items, opening matches, or notifying anyone.
    const testDb: any = {
      from: (name: string) =>
        name === "games"
          ? {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    eq: () => ({
                      limit: () => ({
                        maybeSingle: async () => ({ data: null, error: null }),
                      }),
                    }),
                  }),
                }),
              }),
            }
          : admin.from(name),
      rpc: async (name: string, args: any) => {
        if (name === "start_party_game")
          return { data: { testOnly: true }, error: null };
        const r = await admin.rpc(name, args);
        if (name === "party_game_context" && firstContext && r.data) {
          firstContext = false;
          r.data = { ...r.data, available: 0 };
        }
        return r;
      },
    };
    const generated: any = async (
      prompt: string,
      schema: unknown,
      _fixture: unknown,
      deps: any,
    ) => {
      const r = await requestGemini(
        prompt,
        schema,
        {
          ...deps,
          send: async (...args: Parameters<typeof fetch>) => {
            if (++requests > 2) throw new Error("Request limit reached");
            return fetch(...args);
          },
        },
        {
          key: gemini,
          model: process.env.GEMINI_MODEL || defaultModel,
          fallbacks: [],
          diskCache: false,
        },
      );
      count = cleanPartyItems(kind, r?.data?.items).length;
      return r;
    };
    try {
      await startPartyGame(testDb, c, kind, generated);
      console.log(
        JSON.stringify({
          game: kind,
          validatedItems: count,
          savedWithoutConsumption: true,
        }),
      );
    } catch {
      console.log(
        JSON.stringify({ game: kind, passed: false, validatedItems: count }),
      );
      process.exitCode = 1;
    }
  }
  console.log(JSON.stringify({ actualGeminiRequests: requests }));
}
void main().catch(() => {
  console.error("Live check could not start; no secret values were logged.");
  process.exitCode = 1;
});
