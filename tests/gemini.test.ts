import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { seedTrivia, seedDaily, seedChoices } from "../src/lib/ai/seeds";
import {
  triviaSchema,
  dailySchema,
  choiceSchema,
  questionHash,
  uniqueQuestions,
  readJSON,
} from "../src/lib/ai/validation";
import { generateBatch, requestGemini, retryDelay } from "../src/lib/ai/gemini";
import { cleanTopic } from "../src/lib/ai/topics";
import { startDuel, contentPack } from "../src/lib/ai/service";
import { aiTestDb } from "./ai-db-adapter";
process.env.GEMINI_MOCK = "true";
test("Fallback content is complete, unique, valid and uses varied answer positions", () => {
  assert.equal(seedTrivia.length, 150);
  assert.equal(seedDaily.length, 100);
  assert.equal(seedChoices.length, 100);
  for (const q of seedTrivia)
    assert.ok(triviaSchema.safeParse(q).success, q.question);
  for (const q of seedDaily)
    assert.ok(dailySchema.safeParse(q).success, q.text);
  for (const q of seedChoices)
    assert.ok(choiceSchema.safeParse(q).success, JSON.stringify(q));
  assert.equal(
    new Set(seedTrivia.map((q) => questionHash(q.question))).size,
    150,
  );
  assert.equal(new Set(seedDaily.map((q) => questionHash(q.text))).size, 100);
  assert.equal(
    new Set(
      seedChoices.map((q) =>
        questionHash([q.optionA, q.optionB].sort().join(" ")),
      ),
    ).size,
    100,
  );
  assert.equal(new Set(seedTrivia.map((q) => q.correctIndex)).size, 4);
  assert.equal(
    triviaSchema.safeParse({ ...seedTrivia[0], options: ["a", "a", "b", "c"] })
      .success,
    false,
  );
  assert.equal(
    triviaSchema.safeParse({ ...seedTrivia[0], correctIndex: 4 }).success,
    false,
  );
  assert.equal(
    triviaSchema.safeParse({ ...seedTrivia[0], question: "x".repeat(140) })
      .success,
    false,
  );
  assert.equal(cleanTopic(" Space\n<script>! "), "Space script");
});
test("Normalization and similarity reject repeats while extras fill the batch without a repair request", () => {
  assert.equal(questionHash("  RED planet?! "), questionHash("red planet"));
  const input = [
    seedTrivia[0],
    { ...seedTrivia[0], question: seedTrivia[0].question.toUpperCase() + "!" },
    ...seedTrivia.slice(1, 8),
  ];
  const chosen = uniqueQuestions(input, [seedTrivia[1].question]).slice(0, 5);
  assert.equal(chosen.length, 5);
  assert.equal(
    chosen.filter((q) => q.question === seedTrivia[0].question).length,
    1,
  );
  assert.ok(!chosen.some((q) => q.question === seedTrivia[1].question));
  assert.deepEqual(readJSON('```json\n{"ok":true}\n```'), { ok: true });
});
test("Mock mode cannot touch the network or reserve a real request", async () => {
  const result = await generateBatch("Space", {}, "trivia", {
    send: async () => {
      throw new Error("Network must not run");
    },
    reserve: async () => {
      throw new Error("Budget must not run");
    },
    outcome: async () => {},
  });
  assert.equal(result?.model, "mock");
  assert.equal(result?.data.questions.length, 15);
});
test("429 backs off once, tries one fallback, respects retry-after and stops", async () => {
  const models: string[] = [],
    delays: number[] = [],
    errors: (string | null)[] = [];
  let calls = 0;
  const result = await requestGemini(
    "batch",
    {},
    {
      send: async () => {
        calls++;
        return new Response("", {
          status: 429,
          headers: { "retry-after": "2" },
        });
      },
      reserve: async (m) => {
        models.push(m);
        return true;
      },
      outcome: async (e) => {
        errors.push(e);
      },
      sleep: async (ms) => {
        delays.push(ms);
      },
    },
    {
      key: "test-only",
      model: "gemini-2.5-flash-lite",
      fallbacks: ["gemini-2.5-flash", "unused"],
    },
  );
  assert.equal(result, null);
  assert.equal(calls, 2);
  assert.deepEqual(models, ["gemini-2.5-flash-lite", "gemini-2.5-flash"]);
  assert.deepEqual(delays, [2000]);
  assert.equal(errors.length, 2);
  assert.ok(retryDelay(new Response("", { status: 503 })) >= 1000);
  let attempted = false;
  await requestGemini(
    "batch",
    {},
    {
      send: async () => {
        attempted = true;
        throw new Error();
      },
      reserve: async () => false,
      outcome: async () => {},
    },
    { key: "test-only", model: "gemini-2.5-flash-lite", fallbacks: [] },
  );
  assert.equal(attempted, false);
});
test("Unsafe, incomplete and invalid Gemini responses fall back with no immediate repair request", async () => {
  for (const finishReason of ["SAFETY", "MAX_TOKENS", "STOP"]) {
    let calls = 0;
    const result = await requestGemini(
      "batch",
      {},
      {
        send: async () => {
          calls++;
          return Response.json({
            candidates: [
              { finishReason, content: { parts: [{ text: "not json" }] } },
            ],
          });
        },
        reserve: async () => true,
        outcome: async () => {},
      },
      {
        key: "test-only",
        model: "gemini-2.5-flash-lite",
        fallbacks: ["gemini-2.5-flash"],
      },
    );
    assert.equal(result, null);
    assert.equal(calls, 1);
  }
});
test("Database locks, global budgets, private answers, replay protection and reporting", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create schema realtime;create table realtime.messages(topic text);alter table realtime.messages enable row level security;create function realtime.topic() returns text language sql as $$select current_setting('request.topic',true)$$;create publication supabase_realtime;grant usage on schema auth,public,realtime to authenticated,service_role;`,
    );
    await db.exec(
      `create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(bucket_id text,name text);alter table storage.objects enable row level security;create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;`,
    );
    for (const p of [
      "supabase/setup_fresh_project.sql",
      "supabase/migrations/004_block_battle.sql",
      "supabase/migrations/005_connections.sql",
      "supabase/migrations/008_together.sql",
      "supabase/migrations/009_ai_questions.sql",
    ])
      await db.exec(await readFile(p, "utf8"));
    const c = "06092025-0000-4000-8000-000000000001",
      a = "10000000-0000-4000-8000-000000000001",
      b = "10000000-0000-4000-8000-000000000002",
      o = "10000000-0000-4000-8000-000000000003";
    await db.exec(
      `insert into auth.users values('${a}'),('${b}'),('${o}');insert into profiles(id,couple_id,slot,name) values('${a}','${c}',0,'One'),('${b}','${c}',1,'Two');`,
    );
    const scalar = async <T>(sql: string, args: unknown[] = []) =>
      (await db.query<{ v: T }>(sql, args)).rows[0].v;
    assert.equal(await scalar("select ai_reserve($1,2,3) v", ["m"]), true);
    assert.equal(
      await scalar("select ai_reserve($1,2,3) v", ["fallback"]),
      true,
    );
    assert.equal(await scalar("select ai_reserve($1,2,3) v", ["third"]), false);
    await db.exec("update ai_usage set created_at=now()-interval '2 minutes'");
    assert.equal(await scalar("select ai_reserve($1,4,3) v", ["m"]), true);
    assert.equal(await scalar("select ai_reserve($1,4,3) v", ["m"]), false);
    await db.exec("delete from ai_usage");
    for (let i = 0; i < 3; i++)
      await db.query("select ai_outcome($1)", ["Safe error summary"]);
    assert.equal(await scalar("select ai_reserve($1,4,60) v", ["m"]), false);
    await db.exec("update ai_health set paused_until=null,failures=0");
    const lease = await scalar<string>("select ai_claim($1,$2,$3) v", [
      c,
      "trivia",
      "Space",
    ]);
    assert.ok(lease);
    assert.equal(
      await scalar("select ai_claim($1,$2,$3) v", [c, "trivia", "Space"]),
      null,
    );
    for (const q of seedTrivia.slice(20, 30))
      await db.query(
        "insert into question_bank(topic,question,options,correct_index,fun_fact,hash,source) values($1,$2,$3,$4,$5,$6,$7)",
        [
          "Space",
          q.question,
          q.options,
          q.correctIndex,
          q.funFact,
          questionHash(q.question),
          "fallback",
        ],
      );
    const game = await scalar<{
      id: string;
      state: {
        questions: unknown[];
        round: number;
        last?: unknown;
        scores: number[];
      };
    }>("select to_jsonb(ai_start_duel($1,$2,5,$3,$4)) v", [
      c,
      "Space",
      "Easy",
      lease,
    ]);
    assert.equal(game.state.questions.length, 5);
    assert.ok(!JSON.stringify(game.state).includes("correct"));
    assert.ok(!JSON.stringify(game.state).includes("fun_fact"));
    const joined = await scalar<{ id: string }>(
      "select to_jsonb(ai_start_duel($1,$2,3,$3,$4)) v",
      [c, "Space", "Easy", lease],
    );
    assert.equal(joined.id, game.id);
    await db.exec("set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [a]);
    for (const table of [
      "question_bank",
      "brain_duel_questions",
      "game_answers",
      "ai_usage",
      "ai_health",
    ])
      await assert.rejects(
        db.exec(`select * from ${table}`),
        /permission denied/,
      );
    await assert.rejects(
      db.query("select ai_claim($1,$2,$3)", [c, "trivia", "Space"]),
      /permission denied/,
    );
    const sealed = await scalar<{
      state: { round: number; last?: unknown; scores: number[] };
    }>("select to_jsonb(play_game($1,$2)) v", [
      game.id,
      { answer: "0", scores: [999, 999] },
    ]);
    assert.equal(sealed.state.round, 0);
    assert.equal(sealed.state.last, undefined);
    assert.deepEqual(sealed.state.scores, [0, 0]);
    await assert.rejects(
      db.query("select play_game($1,$2)", [game.id, { answer: "1" }]),
      /sealed/,
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [b]);
    const revealed = await scalar<{
      state: { last: { correct: string; funFact: string }; round: number };
    }>("select to_jsonb(play_game($1,$2)) v", [game.id, { answer: "1" }]);
    assert.equal(revealed.state.round, 1);
    assert.equal(typeof revealed.state.last.correct, "string");
    assert.ok(revealed.state.last.funFact);
    await db.query("select report_question($1,1)", [game.id]);
    await db.query("select set_ai_questions(false,$1)", ["Pacific/Kiritimati"]);
    assert.equal(
      await scalar("select couple_day()::text v"),
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Pacific/Kiritimati",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date()),
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [o]);
    await assert.rejects(
      db.query("select report_question($1,1)", [game.id]),
      /unavailable/,
    );
    assert.equal((await db.query("select * from games")).rows.length, 0);
    await db.exec(
      'reset role;update games set state=state||\'{"status":"draw"}\'::jsonb where id=\'' +
        game.id +
        "'",
    );
    const next = await scalar<{ id: string }>(
      "select to_jsonb(ai_start_duel($1,$2,5,$3,$4)) v",
      [c, "Space", "Easy", lease],
    );
    assert.notEqual(next.id, game.id);
    assert.equal(
      await scalar("select count(*)::int v from question_history"),
      10,
    );
    assert.equal(
      await scalar("select count(*)::int v from question_bank where flagged"),
      1,
    );
    await db.exec('update games set state=state||\'{"status":"draw"}\'::jsonb');
    const admin = aiTestDb(db);
    let generated = 0;
    let release!: () => void;
    await db.exec("update couples set use_ai_questions=true");
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const make = async (prompt: string) => {
      generated++;
      assert.equal(JSON.parse(prompt).count, 10);
      assert.ok(!/One|Two|anniversary|answer/.test(prompt));
      await gate;
      return {
        data: { topic: "Science", questions: seedTrivia.slice(0, 10) },
        model: "mock",
        source: "mock",
      };
    };
    const first = startDuel(
      admin,
      c,
      { topic: "Science", count: 5, difficulty: "Easy" },
      false,
      make,
    );
    // Wait on the fake generator entering its controlled gate, not arbitrary wall-clock time.
    await Promise.race([
      new Promise<void>((resolve) => {
        const check = () => (generated ? resolve() : setImmediate(check));
        check();
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("Generator did not reach the fixture gate")),
          3000,
        ),
      ),
    ]);
    const waiting = await startDuel(
      admin,
      c,
      { topic: "Science", count: 5, difficulty: "Easy" },
      false,
      make,
    );
    assert.equal(waiting.pending, true);
    release();
    const one = await first;
    assert.ok(one.game);
    assert.equal(generated, 1);
    const same = await startDuel(
      admin,
      c,
      { topic: "Science", count: 5, difficulty: "Easy" },
      false,
      make,
    );
    assert.equal(same.game.id, one.game.id);
    await db.query(
      'update games set state=state||\'{"status":"draw"}\'::jsonb where id=$1',
      [one.game.id],
    );
    const two = await startDuel(
      admin,
      c,
      { topic: "Science", count: 5, difficulty: "Easy" },
      false,
      make,
    );
    assert.equal(two.game.state.questions.length, 5);
    assert.equal(generated, 1);
    assert.equal(
      new Set(
        [...one.game.state.questions, ...two.game.state.questions].map(
          (x) => x.q,
        ),
      ).size,
      10,
    );
    await db.query(
      'update games set state=state||\'{"status":"draw"}\'::jsonb where id=$1',
      [two.game.id],
    );
    const fallback = await startDuel(
      admin,
      c,
      { topic: "Dinosaurs", count: 10, difficulty: "Easy" },
      false,
      async () => null,
    );
    assert.equal(fallback.game.state.questions.length, 10);
    assert.equal(fallback.game.state.source, "saved");
    assert.ok(!JSON.stringify(fallback.game.state).includes("correct_index"));
    let packs = 0;
    const pack = async () => {
      packs++;
      return {
        data: JSON.parse(
          await readFile("fixtures/gemini/content.json", "utf8"),
        ),
        model: "mock",
        source: "mock",
      };
    };
    const today = await contentPack(admin, c, pack);
    const again = await contentPack(admin, c, pack);
    assert.equal(packs, 1);
    assert.deepEqual(today, again);
    assert.equal(
      await scalar("select count(*)::int v from daily_questions"),
      30,
    );
    assert.equal(
      await scalar("select count(*)::int v from would_you_rather"),
      30,
    );
  } finally {
    await db.close();
  }
});
