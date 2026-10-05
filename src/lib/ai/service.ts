import type { SupabaseClient } from "@supabase/supabase-js";
import { generateBatch, defaultModel } from "./gemini";
import { seedTrivia, seedDaily, seedChoices } from "./seeds";
import { cleanTopic, type DuelOptions } from "./topics";
import {
  triviaSchema,
  dailySchema,
  choiceSchema,
  validatedItems,
  uniqueQuestions,
  questionHash,
  triviaResponseSchema,
  contentResponseSchema,
} from "./validation";
export function cap(name: string, value: number) {
  const n = Number(process.env[name] ?? value);
  return Number.isFinite(n)
    ? Math.max(0, Math.min(value, Math.floor(n)))
    : value;
}
async function rpc(
  db: SupabaseClient,
  name: string,
  args: Record<string, unknown>,
) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error("AI_DATABASE");
  return data;
}
function deps(db: SupabaseClient) {
  return {
    reserve: async (model: string) =>
      Boolean(
        await rpc(db, "ai_reserve", {
          model_name: model,
          rpm: cap("GEMINI_RPM_LIMIT", 4),
          budget: cap("GEMINI_DAILY_BUDGET", 60),
        }),
      ),
    outcome: async (error: string | null) => {
      await rpc(db, "ai_outcome", { message: error });
    },
  };
}
async function couple(db: SupabaseClient, c: string) {
  const { data, error } = await db
    .from("couples")
    .select("timezone,use_ai_questions")
    .eq("id", c)
    .single();
  if (error) throw new Error("AI_DATABASE");
  return data;
}
async function bank(
  db: SupabaseClient,
  c: string,
  t: string,
  d: string,
): Promise<{ available: { id: string }[]; history: string[] }> {
  return rpc(db, "ai_bank_context", { c, t, d });
}
async function existingGame(db: SupabaseClient, c: string) {
  const { data, error } = await db
    .from("games")
    .select("*")
    .eq("couple_id", c)
    .eq("kind", "trivia")
    .eq("state->>status", "playing")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("AI_DATABASE");
  return data;
}
export async function startDuel(
  db: SupabaseClient,
  c: string,
  options: DuelOptions,
  savedOnly = false,
  generate: typeof generateBatch = generateBatch,
) {
  const existing = await existingGame(db, c);
  if (existing) return { game: existing };
  const topic = cleanTopic(options.topic),
    count = [3, 5, 10].includes(options.count) ? options.count : 5,
    difficulty = options.difficulty === "Easy" ? "Easy" : "Easy-Medium";
  const lease = savedOnly
    ? await rpc(db, "ai_claim_saved", { c, t: topic })
    : await rpc(db, "ai_claim", { c, k: "trivia", t: topic });
  if (!lease) return { pending: true };
  try {
    let { available, history } = await bank(db, c, topic, difficulty);
    if (available.length < count) {
      const prefs = await couple(db, c);
      const generated =
        prefs.use_ai_questions && !savedOnly
          ? await generate(
              JSON.stringify({
                topic,
                count: count + cap("GEMINI_EXTRA_QUESTIONS", 5),
                difficulty,
                doNotRepeat: history,
              }),
              triviaResponseSchema,
              "trivia",
              deps(db),
            )
          : null;
      const candidates = generated
        ? validatedItems(triviaSchema, generated.data?.questions)
        : [];
      // A batch stuck on one answer position fails validation, with no repair call.
      const good =
        candidates.length > 1 &&
        new Set(candidates.map((q) => q.correctIndex)).size === 1
          ? []
          : uniqueQuestions(candidates, history);
      if (
        generated &&
        good.length !==
          (Array.isArray(generated.data?.questions)
            ? generated.data.questions.length
            : 0)
      )
        await rpc(db, "ai_outcome", {
          message: "Some generated questions were invalid or repeated.",
        });
      if (good.length) {
        const { error } = await db.from("question_bank").upsert(
          good.map((q) => ({
            topic,
            difficulty,
            question: q.question,
            options: q.options,
            correct_index: q.correctIndex,
            fun_fact: q.funFact,
            hash: questionHash(q.question),
            source: generated!.source,
          })),
          { onConflict: "topic,hash", ignoreDuplicates: true },
        );
        if (error) throw new Error("AI_DATABASE");
      }
      ({ available } = await bank(db, c, topic, difficulty));
      if (available.length < count) {
        const fallback = [
          ...seedTrivia.filter((q) => q.topic === topic),
          ...seedTrivia.filter((q) => q.topic !== topic),
        ];
        const { error } = await db.from("question_bank").upsert(
          fallback.map((q) => ({
            topic,
            difficulty,
            question: q.question,
            options: q.options,
            correct_index: q.correctIndex,
            fun_fact: q.funFact,
            hash: questionHash(q.question),
            source: "fallback",
          })),
          { onConflict: "topic,hash", ignoreDuplicates: true },
        );
        if (error) throw new Error("AI_DATABASE");
      }
    }
    return {
      game: await rpc(db, "ai_start_duel", {
        c,
        t: topic,
        n: count,
        d: difficulty,
        lease,
      }),
    };
  } finally {
    await rpc(db, "ai_finish", { c, k: "trivia", t: topic, lease });
  }
}
function localDay(timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
function addDay(day: string, n: number) {
  return new Date(Date.parse(day + "T12:00:00Z") + n * 86400000)
    .toISOString()
    .slice(0, 10);
}
export async function contentPack(
  db: SupabaseClient,
  c: string,
  generate: typeof generateBatch = generateBatch,
) {
  const prefs = await couple(db, c),
    today = localDay(prefs.timezone);
  const read = async () => {
    const [d, w] = await Promise.all([
      db
        .from("daily_questions")
        .select("*")
        .eq("couple_id", c)
        .order("date", { ascending: false }),
      db
        .from("would_you_rather")
        .select("*")
        .eq("couple_id", c)
        .order("date", { ascending: false }),
    ]);
    if (d.error || w.error) throw new Error("AI_DATABASE");
    return { daily: d.data, choice: w.data };
  };
  let rows = await read();
  if (
    rows.daily.filter((q) => q.date >= today).length < 7 ||
    rows.choice.filter((q) => q.date >= today).length < 7
  ) {
    const lease = await rpc(db, "ai_claim", { c, k: "content", t: "monthly" });
    if (lease) {
      try {
        // Re-read under the lease: a stale app-open must not create a second pack.
        rows = await read();
        if (
          rows.daily.filter((q) => q.date >= today).length < 7 ||
          rows.choice.filter((q) => q.date >= today).length < 7
        ) {
          const generated = prefs.use_ai_questions
            ? await generate(
                JSON.stringify({
                  count: 30,
                  dailyDoNotRepeat: rows.daily.slice(0, 30).map((x) => x.text),
                  pairsDoNotRepeat: rows.choice
                    .slice(0, 30)
                    .map((x) => [x.option_a, x.option_b]),
                }),
                contentResponseSchema,
                "content",
                deps(db),
              )
            : null;
          const daily = validatedItems(
              dailySchema,
              generated?.data?.dailyQuestions,
            ),
            choice = validatedItems(
              choiceSchema,
              generated?.data?.wouldYouRather,
            );
          if (generated && (daily.length !== 30 || choice.length !== 30))
            await rpc(db, "ai_outcome", {
              message:
                "Content pack had invalid or missing items; saved content filled the gaps.",
            });
          const dailyHashes = new Set(
              rows.daily.slice(0, 30).map((x) => x.hash),
            ),
            choiceHashes = new Set(rows.choice.slice(0, 30).map((x) => x.hash));
          const ds = [
            ...daily.map((x) => ({ ...x, source: generated!.source })),
            ...seedDaily.map((x) => ({ ...x, source: "fallback" })),
          ]
            .filter((x) => {
              const h = questionHash(x.text);
              if (dailyHashes.has(h)) return false;
              dailyHashes.add(h);
              return true;
            })
            .slice(0, 30);
          const ws = [
            ...choice.map((x) => ({ ...x, source: generated!.source })),
            ...seedChoices.map((x) => ({ ...x, source: "fallback" })),
          ]
            .filter((x) => {
              const h = questionHash([x.optionA, x.optionB].sort().join(" "));
              if (choiceHashes.has(h)) return false;
              choiceHashes.add(h);
              return true;
            })
            .slice(0, 30);
          const dateStart = (items: { date: string }[]) =>
            items[0]?.date >= today ? addDay(items[0].date, 1) : today;
          const dStart = dateStart(rows.daily),
            wStart = dateStart(rows.choice);
          if (ds.length) {
            const { error } = await db.from("daily_questions").insert(
              ds.map((x, i) => ({
                couple_id: c,
                date: addDay(dStart, i),
                text: x.text,
                mood: x.mood,
                hash: questionHash(x.text),
                source: x.source,
              })),
            );
            if (error) throw new Error("AI_DATABASE");
          }
          if (ws.length) {
            const { error } = await db.from("would_you_rather").insert(
              ws.map((x, i) => ({
                couple_id: c,
                date: addDay(wStart, i),
                option_a: x.optionA,
                option_b: x.optionB,
                hash: questionHash([x.optionA, x.optionB].sort().join(" ")),
                source: x.source,
              })),
            );
            if (error) throw new Error("AI_DATABASE");
          }
        }
      } finally {
        await rpc(db, "ai_finish", { c, k: "content", t: "monthly", lease });
      }
    }
  }
  rows = await read();
  const d = rows.daily.find((x) => x.date === today),
    w = rows.choice.find((x) => x.date === today);
  if (!d || !w) return { pending: true };
  return {
    day: today,
    timezone: prefs.timezone,
    daily: d.text,
    choice: [w.option_a, w.option_b],
    saved: d.source !== "ai" || w.source !== "ai",
  };
}
export async function aiStatus(db: SupabaseClient, c: string) {
  const prefs = await couple(db, c),
    today = localDay(prefs.timezone);
  const [usage, health, bank, d, w] = await Promise.all([
    db
      .from("ai_usage")
      .select("id", { count: "exact", head: true })
      .gte("created_at", new Date().toISOString().slice(0, 10) + "T00:00:00Z"),
    db.from("ai_health").select("last_error,paused_until").single(),
    db.from("question_bank").select("topic").eq("flagged", false),
    db
      .from("daily_questions")
      .select("date", { count: "exact", head: true })
      .eq("couple_id", c)
      .gte("date", today),
    db
      .from("would_you_rather")
      .select("date", { count: "exact", head: true })
      .eq("couple_id", c)
      .gte("date", today),
  ]);
  if ([usage, health, bank, d, w].some((x) => x.error))
    throw new Error("AI_DATABASE");
  const sizes: Record<string, number> = {};
  bank.data?.forEach((x) => (sizes[x.topic] = (sizes[x.topic] || 0) + 1));
  return {
    configured: Boolean(process.env.GEMINI_API_KEY),
    model: process.env.GEMINI_MODEL || defaultModel,
    mock:
      process.env.GEMINI_MOCK === "true" ||
      process.env.NODE_ENV !== "production",
    used: usage.count || 0,
    budget: cap("GEMINI_DAILY_BUDGET", 60),
    lastError: health.data?.last_error,
    pausedUntil: health.data?.paused_until,
    bank: sizes,
    dailyDays: d.count || 0,
    choiceDays: w.count || 0,
    enabled: prefs.use_ai_questions,
    timezone: prefs.timezone,
  };
}
