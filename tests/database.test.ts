import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const lance = "10000000-0000-4000-8000-000000000001",
  elaine = "10000000-0000-4000-8000-000000000002",
  stranger = "10000000-0000-4000-8000-000000000003";
test("Postgres validates moves, seals answers, restricts outsiders and drawing secrets", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create schema realtime;create table realtime.messages(topic text);alter table realtime.messages enable row level security;create function realtime.topic() returns text language sql as $$select current_setting('request.topic',true)$$;create publication supabase_realtime;grant usage on schema auth,public,realtime to authenticated;grant execute on function auth.uid(),realtime.topic() to authenticated;`,
    );
    await db.exec(await readFile("supabase/migrations/001_arcade.sql", "utf8"));
    await db.exec(
      await readFile("supabase/migrations/003_stage_two.sql", "utf8"),
    );
    await db.exec(
      `insert into auth.users values('${lance}'),('${elaine}'),('${stranger}');insert into profiles(id,couple_id,slot,name) values('${lance}','06092025-0000-4000-8000-000000000001',0,'Lance'),('${elaine}','06092025-0000-4000-8000-000000000001',1,'Elaine');set role authenticated;`,
    );
    const as = async (id: string) => {
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        id,
      ]);
    };
    const rpc = async <T = any>(sql: string, params: unknown[] = []) => {
      const result = await db.query<{ value: T }>(
        `select to_jsonb(${sql}) as value`,
        params,
      );
      return result.rows[0].value;
    };
    await as(lance);
    await rpc("set_nickname($1)", ["My chosen nickname"]);
    const nicknames = await db.query<{ nickname: string }>(
      "select nickname from profiles order by slot",
    );
    assert.deepEqual(
      nicknames.rows.map((p) => p.nickname),
      ["My chosen nickname", ""],
    );
    await assert.rejects(
      rpc("set_nickname($1)", ["x".repeat(41)]),
      /40 characters/,
    );
    await as(stranger);
    await assert.rejects(rpc("set_nickname($1)", ["Intruder"]), /invitation/);
    await assert.rejects(rpc("new_game($1)", ["tic"]), /invitation/);
    await as(lance);
    const tic = await rpc("new_game($1)", ["tic"]);
    assert.equal(
      (await rpc("new_game($1)", ["tic"])).id,
      tic.id,
      "join the active game instead of duplicating it",
    );
    await as(elaine);
    await assert.rejects(
      rpc("play_game($1,$2)", [tic.id, { cell: 4 }]),
      /turn/,
    );
    for (const [id, cell] of [
      [lance, 0],
      [elaine, 3],
      [lance, 1],
      [elaine, 4],
      [lance, 2],
    ] as const) {
      await as(id);
      await rpc("play_game($1,$2)", [tic.id, { cell }]);
    }
    const won = await rpc("play_game($1,$2)", [tic.id, { cell: 5 }]).catch(
      (e) => e,
    );
    assert.match(won.message, /finished/);
    const rows = await db.query<{ state: any }>(
      "select state from games where id=$1",
      [tic.id],
    );
    assert.equal(rows.rows[0].state.winner, 0);
    await as(lance);
    const c4 = await rpc("new_game($1)", ["connect"]);
    for (const [id, cell] of [
      [lance, 0],
      [elaine, 1],
      [lance, 0],
      [elaine, 1],
      [lance, 0],
      [elaine, 1],
      [lance, 0],
    ] as const) {
      await as(id);
      await rpc("play_game($1,$2)", [c4.id, { cell }]);
    }
    assert.equal(
      (
        await db.query<{ state: any }>("select state from games where id=$1", [
          c4.id,
        ])
      ).rows[0].state.winner,
      0,
    );
    await as(lance);
    await rpc("answer_today($1,$2)", ["daily", "my private answer"]);
    await as(elaine);
    let today = await rpc("today_answers()");
    assert.equal(today.daily[0].answer, null);
    await rpc("answer_today($1,$2)", ["daily", "her answer"]);
    today = await rpc("today_answers()");
    assert.equal(
      today.daily.find((a: any) => a.user_id === lance).answer,
      "my private answer",
    );
    assert.equal(today.streak, 1);
    await assert.rejects(db.query("select * from answers"), /permission/);
    const quiz = await rpc("new_game($1)", ["know"]);
    await assert.rejects(
      rpc("play_game($1,$2)", [quiz.id, {}]),
      /both questions/,
    );
    await as(lance);
    await rpc("play_game($1,$2)", [quiz.id, { self: "1", guess: "2" }]);
    await assert.rejects(
      rpc("play_game($1,$2)", [quiz.id, { self: "3", guess: "0" }]),
      /sealed/,
    );
    await as(elaine);
    await assert.rejects(db.query("select * from game_answers"), /permission/);
    const revealed = await rpc("play_game($1,$2)", [
      quiz.id,
      { self: "2", guess: "1" },
    ]);
    assert.deepEqual(revealed.state.scores, [1, 1]);
    await as(lance);
    const drawing = await rpc("new_game($1)", ["draw"]);
    const secret = await rpc("drawing_word($1)", [drawing.id]);
    assert.ok(secret);
    await as(elaine);
    assert.equal(await rpc("drawing_word($1)", [drawing.id]), null);
    await assert.rejects(
      rpc("save_entry($1,$2)", [
        "stroke",
        { game: drawing.id, color: "#344f3f", points: [[0.1, 0.2]] },
      ]),
      /artist/,
    );
    const guessed = await rpc("play_game($1,$2)", [
      drawing.id,
      { guess: secret },
    ]);
    assert.equal(guessed.state.winner, 1);
    await as(stranger);
    assert.equal((await db.query("select * from games")).rows.length, 0);
    await assert.rejects(rpc("new_game($1)", ["tic"]), /invitation/);
    await assert.rejects(
      rpc("save_entry($1,$2)", ["notes", { text: "bad" }]),
      /invitation/,
    );
    await assert.rejects(
      rpc("play_game($1,$2)", [quiz.id, { self: "0", guess: "0" }]),
      /unavailable/,
    );
  } finally {
    await db.close();
  }
});
