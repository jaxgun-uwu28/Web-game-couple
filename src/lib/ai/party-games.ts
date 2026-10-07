import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { generateBatch } from "./gemini";
import { questionHash } from "./validation";
import { cap } from "./service";
export const partnerQuestion = z.object({
  q: z.string().trim().min(8).max(140),
  options: z
    .array(z.string().trim().min(1).max(50))
    .length(4)
    .refine((a) => new Set(a.map((s) => s.toLowerCase())).size === 4),
});
export const drawingWord = z.object({
  word: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z]+(?: [a-z]+)?$/)
    .max(30),
});
export function cleanPartyItems(
  kind: "know" | "draw",
  items: unknown,
  history: unknown[] = [],
) {
  const seen = new Set(
    history.map((x) =>
      questionHash(
        kind === "know" ? (x as { q: string }).q : (x as { word: string }).word,
      ),
    ),
  );
  return (Array.isArray(items) ? items : []).flatMap((x) => {
    const r = (kind === "know" ? partnerQuestion : drawingWord).safeParse(x);
    if (!r.success) return [];
    const text = "q" in r.data ? r.data.q : r.data.word,
      hash = questionHash(text);
    if (seen.has(hash)) return [];
    seen.add(hash);
    return [{ hash, item: r.data }];
  });
}
export async function startPartyGame(
  db: SupabaseClient,
  c: string,
  kind: "know" | "draw",
  generate: typeof generateBatch = generateBatch,
  drawConfig: { rounds: number; seconds: number } = { rounds: 5, seconds: 60 },
) {
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = await db.rpc(name, args);
    if (r.error)
      throw new Error("Saved game content could not load. Please retry.");
    return r.data;
  };
  const existing = await db
    .from("games")
    .select("*")
    .eq("couple_id", c)
    .eq("kind", kind)
    .eq("state->>status", "playing")
    .limit(1)
    .maybeSingle();
  if (existing.error) throw new Error("Your game could not load.");
  if (existing.data) return { game: existing.data };
  const lease = await call("ai_claim", { c, k: kind, t: "party" });
  if (!lease) return { pending: true };
  try {
    const context = await call("party_game_context", { c, k: kind }),
      need = kind === "know" ? 5 : drawConfig.rounds;
    if (context.available < need) {
      const isKnow = kind === "know";
      const itemSchema = isKnow
        ? {
            type: "OBJECT",
            properties: {
              q: { type: "STRING" },
              options: {
                type: "ARRAY",
                items: { type: "STRING" },
                minItems: 4,
                maxItems: 4,
              },
            },
            required: ["q", "options"],
          }
        : {
            type: "OBJECT",
            properties: { word: { type: "STRING" } },
            required: ["word"],
          };
      const result = await generate(
        JSON.stringify({
          task: isKnow
            ? "Create personal preference questions for a couple to choose their own answer and predict their partner. No factual correct answer. Four distinct appealing answers per question."
            : "Create simple drawable everyday objects, animals, foods and actions. One or two English words each. No names or abstract ideas.",
          count: isKnow ? 40 : 100,
          doNotRepeat: context.history.map(
            (x: { q?: string; word?: string }) => x.q || x.word,
          ),
        }),
        {
          type: "OBJECT",
          properties: { items: { type: "ARRAY", items: itemSchema } },
          required: ["items"],
        },
        isKnow ? "know" : "draw",
        {
          reserve: async (model) =>
            Boolean(
              await call("ai_reserve", {
                model_name: model,
                rpm: cap("GEMINI_RPM_LIMIT", 4),
                budget: cap("GEMINI_DAILY_BUDGET", 60),
              }),
            ),
          outcome: async (message) => {
            await call("ai_outcome", { message });
          },
        },
      );
      const good = cleanPartyItems(kind, result?.data?.items, context.history);
      if (good.length) {
        const r = await db.from("party_game_bank").upsert(
          good.map((x) => ({ ...x, couple_id: c, kind })),
          { onConflict: "couple_id,kind,hash", ignoreDuplicates: true },
        );
        if (r.error) throw new Error("The new game content could not save.");
      }
      if ((await call("party_game_context", { c, k: kind })).available < need)
        throw new Error("Gemini content is unavailable. Please retry shortly.");
    }
    return {
      game:
        kind === "draw"
          ? await call("start_draw_game", {
              c,
              rounds: drawConfig.rounds,
              seconds: drawConfig.seconds,
            })
          : await call("start_party_game", { c, k: kind }),
    };
  } finally {
    await call("ai_finish", { c, k: kind, t: "party", lease });
  }
}
