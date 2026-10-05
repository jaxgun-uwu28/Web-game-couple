import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  heartFits,
  heartStep,
  defaultHeartOptions,
  heartHand,
  heartScore,
} from "../src/lib/heartblast";
test("Heartblast migration, authoritative replay, modes, async readiness, cancellation and shared wheel", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create schema realtime;create table realtime.messages(topic text);alter table realtime.messages enable row level security;create function realtime.topic() returns text language sql as $$select current_setting('request.topic',true)$$;create publication supabase_realtime;grant usage on schema auth,public,realtime to authenticated,service_role;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(bucket_id text,name text);alter table storage.objects enable row level security;create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;`,
    );
    for (const file of [
      "supabase/setup_fresh_project.sql",
      ...[
        "004_block_battle",
        "005_connections",
        "008_together",
        "009_ai_questions",
        "010_brain_lobby",
        "011_game_presence_and_taps",
        "012_activities_heartblast",
      ].map((n) => `supabase/migrations/${n}.sql`),
    ])
      await db.exec(await readFile(file, "utf8"));
    await db.exec(
      await readFile(
        "supabase/migrations/012_activities_heartblast.sql",
        "utf8",
      ),
    );
    const c = "06092025-0000-4000-8000-000000000001",
      a = "10000000-0000-4000-8000-000000000001",
      b = "10000000-0000-4000-8000-000000000002",
      o = "10000000-0000-4000-8000-000000000003";
    await db.exec(
      `insert into auth.users values('${a}'),('${b}'),('${o}');insert into profiles(id,couple_id,slot,name) values('${a}','${c}',0,'One'),('${b}','${c}',1,'Two');`,
    );
    const scalar = async <T>(sql: string, args: unknown[] = []) =>
        (await db.query<{ v: T }>(sql, args)).rows[0].v,
      login = async (id: string) => {
        await db.exec("set role authenticated");
        await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
          id,
        ]);
      },
      admin = async (sql: string, args: unknown[] = []) => {
        await db.exec("reset role");
        await db.query(sql, args);
      },
      start = async (config: object) =>
        scalar<any>("select start_heartblast($1) v", [JSON.stringify(config)]),
      act = async (id: string, action: object) =>
        scalar<any>("select heartblast_battle($1,$2) v", [
          id,
          JSON.stringify(action),
        ]);
    await login(a);
    let rev = await scalar<number>("select save_wheel($1,0) v", [
      JSON.stringify([
        { id: "one", text: "Sushi" },
        { id: "two", text: "Movie" },
      ]),
    ]);
    assert.equal(rev, 1);
    await login(b);
    await assert.rejects(
      () => scalar("select save_wheel($1,0) v", ["[]"]),
      /changed/,
    );
    rev = await scalar<number>("select save_wheel($1,1) v", [
      JSON.stringify([{ id: "two", text: "Movie" }]),
    ]);
    assert.equal(rev, 2);
    await login(o);
    assert.equal(
      (await db.query("select * from activity_wheels")).rows.length,
      0,
    );
    await assert.rejects(() => start(defaultHeartOptions));
    await login(a);
    let r = await start(defaultHeartOptions),
      id = r.match.id;
    await assert.rejects(() => act(id, { type: "ready" }), /Waiting/);
    await scalar("select game_here($1,$2) v", [id, "block"]);
    await login(b);
    await scalar("select game_here($1,$2) v", [id, "block"]);
    await act(id, { type: "ready" });
    await login(a);
    r = await act(id, { type: "ready" });
    assert.equal(r.match.status, "playing");
    await assert.rejects(
      () =>
        act(id, {
          type: "place",
          piece: 0,
          row: 0,
          col: 0,
          move_id: crypto.randomUUID(),
        }),
      /countdown/,
    );
    await admin(
      "update block_matches set starts_at=clock_timestamp()-interval '1 second' where id=$1",
      [id],
    );
    await login(a);
    const expected = heartStep(r.match.state, r.match.seed, 0, 0, 0, 0),
      move = crypto.randomUUID();
    r = await act(id, {
      type: "place",
      piece: 0,
      row: 0,
      col: 0,
      move_id: move,
      score: 999999,
    });
    assert.deepEqual(r.match.state.boards, expected.boards);
    assert.deepEqual(r.match.state.scores, expected.scores);
    r = await act(id, {
      type: "place",
      piece: 0,
      row: 0,
      col: 0,
      move_id: move,
    });
    assert.equal(r.match.state.pieces[0], 1);
    await admin(
      "update block_matches set state=jsonb_set(state,'{scores,0}','999999') where id=$1",
      [id],
    );
    await login(a);
    const s = r.match.state,
      shape = s.hands[0][1],
      pos = s.boards[0].findIndex((_: number, i: number) =>
        heartFits(s.boards[0], shape, Math.floor(i / 8), i % 8),
      );
    assert.ok(pos >= 0);
    const exp2 = heartStep(s, r.match.seed, 0, 1, Math.floor(pos / 8), pos % 8);
    r = await act(id, {
      type: "place",
      piece: 1,
      row: Math.floor(pos / 8),
      col: pos % 8,
      move_id: crypto.randomUUID(),
    });
    assert.deepEqual(r.match.state.scores, exp2.scores);
    assert.equal(
      await scalar<number>(
        "select count(*)::int v from match_moves where match_id=$1",
        [id],
      ),
      2,
    );
    await admin(
      "update block_matches set ends_at=clock_timestamp()-interval '2 seconds' where id=$1",
      [id],
    );
    await login(a);
    r = await act(id, {
      type: "place",
      piece: 2,
      row: 7,
      col: 7,
      move_id: crypto.randomUUID(),
    });
    assert.equal(r.match.status, "won");
    assert.equal(
      await scalar<number>(
        "select count(*)::int v from match_moves where match_id=$1",
        [id],
      ),
      2,
    );
    // Endless can be played on different days/phones without paired presence.
    r = await start({ ...defaultHeartOptions, mode: "endless" });
    id = r.match.id;
    r = await act(id, { type: "ready" });
    assert.equal(r.match.state.ready[0], true);
    await admin(
      "update block_matches set starts_at=clock_timestamp()-interval '1 second' where id=$1",
      [id],
    );
    await login(a);
    await act(id, {
      type: "place",
      piece: 0,
      row: 0,
      col: 0,
      move_id: crypto.randomUUID(),
    });
    await act(id, { type: "out", move_id: crypto.randomUUID() });
    await login(b);
    r = await act(id, { type: "ready" });
    assert.equal(r.match.state.ready[1], true);
    r = await act(id, { type: "out", move_id: crypto.randomUUID() });
    assert.equal(r.match.status, "won");
    assert.equal(r.match.winner, 0);
    await login(a);
    r = await start({ ...defaultHeartOptions, mode: "daily" });
    const daily = r.match;
    await login(b);
    r = await start({ ...defaultHeartOptions, mode: "daily" });
    assert.equal(r.match.id, daily.id);
    assert.deepEqual(r.match.state.hands[0], r.match.state.hands[1]);
    await act(r.match.id, {
      type: "place",
      piece: 0,
      row: 0,
      col: 0,
      move_id: crypto.randomUUID(),
    });
    await scalar("select game_here($1,$2,true) v", [r.match.id, "block"]);
    r = await act(r.match.id, { type: "get" });
    assert.equal(r.match.status, "cancelled");
    // Seed-only SQL trays match the shared TypeScript rules; single-board guarantee.
    await db.exec("reset role");
    for (let tray = 0; tray < 100; tray++)
      assert.deepEqual(
        await scalar("select heart_hand(123,$1) v", [tray]),
        heartHand(123, tray),
      );
    for (let n = 0; n < 100; n++) {
      const board = Array(64).fill(1);
      board[n % 64] = 0;
      const h = await scalar<number[]>("select heart_hand($1,$2,$3) v", [
        n + 1,
        n,
        JSON.stringify(board),
      ]);
      assert.ok(
        h.some((shape) =>
          heartFits(board, shape, Math.floor((n % 64) / 8), n % 8),
        ),
      );
    }
    // Simultaneous row/column clear, streak and empty bonus use canonical scoring.
    const st = await scalar<any>("select heart_initial(123,$1) v", [
      JSON.stringify(defaultHeartOptions),
    ]);
    st.hands[0][0] = 0;
    for (let i = 1; i < 8; i++) st.boards[0][i] = st.boards[0][i * 8] = 1;
    st.combos[0] = 2;
    const actual = await scalar<any>("select heart_step($1,123,0,$2) v", [
      JSON.stringify(st),
      JSON.stringify({ type: "place", piece: 0, row: 0, col: 0 }),
    ]);
    assert.equal(actual.last.points, heartScore(1, 2, 2, true).points);
    // Junk parity/cap and neighboring-line cloud removal.
    st.options.junk=true;
    const junk=await scalar<any>('select heart_step($1,123,0,$2) v',[JSON.stringify(st),JSON.stringify({type:'place',piece:0,row:0,col:0})]);
    const junkExpected=heartStep(st,123,0,0,0,0);
    assert.deepEqual(junk.boards,junkExpected.boards);assert.equal(junk.boards[1].filter((v:number)=>v===-1).length,2);
    st.boards[1]=Array(64).fill(1);st.boards[1][63]=0;st.hands[1]=[0,0,0];
    const capped=await scalar<any>('select heart_step($1,123,0,$2) v',[JSON.stringify(st),JSON.stringify({type:'place',piece:0,row:0,col:0})]);
    assert.equal(capped.boards[1][63],0);
    const cloud=structuredClone(st);cloud.options.junk=false;cloud.boards[0]=Array(64).fill(0);for(let i=1;i<8;i++)cloud.boards[0][i]=1;cloud.boards[0][8]=-1;
    const clearCloud=await scalar<any>('select heart_step($1,123,0,$2) v',[JSON.stringify(cloud),JSON.stringify({type:'place',piece:0,row:0,col:0})]);assert.equal(clearCloud.boards[0][8],0);
    // Co-op alternates actors on the same board and retains the shared score.
    await login(a);r=await start({...defaultHeartOptions,coop:true});id=r.match.id;await scalar('select game_here($1,$2) v',[id,'block']);await login(b);await scalar('select game_here($1,$2) v',[id,'block']);await act(id,{type:'ready'});await login(a);await act(id,{type:'ready'});await admin("update block_matches set starts_at=clock_timestamp()-interval '1 second' where id=$1",[id]);await login(b);await assert.rejects(()=>act(id,{type:'place',piece:0,row:0,col:0,move_id:crypto.randomUUID()}),/turn/);await login(a);r=await act(id,{type:'place',piece:0,row:0,col:0,move_id:crypto.randomUUID()});assert.equal(r.match.state.turn,1);await assert.rejects(()=>act(id,{type:'place',piece:1,row:5,col:0,move_id:crypto.randomUUID()}),/turn/);await login(b);const co=r.match.state,coShape=co.hands[0][1],coPos=co.boards[0].findIndex((_:number,i:number)=>heartFits(co.boards[0],coShape,Math.floor(i/8),i%8));r=await act(id,{type:'place',piece:1,row:Math.floor(coPos/8),col:coPos%8,move_id:crypto.randomUUID()});assert.equal(r.match.state.scores[1],0);assert.equal(r.match.state.turn,0);await act(id,{type:'cancel'});
    // Race target gate: target 1 is rejected from clients, then used as a near-finish fixture.
    await login(a);await assert.rejects(()=>start({...defaultHeartOptions,mode:'race',target:1}));r=await start({...defaultHeartOptions,mode:'race'});id=r.match.id;await scalar('select game_here($1,$2) v',[id,'block']);await login(b);await scalar('select game_here($1,$2) v',[id,'block']);await act(id,{type:'ready'});await login(a);await act(id,{type:'ready'});await admin("update block_matches set starts_at=clock_timestamp()-interval '1 second',state=jsonb_set(state,'{options,target}','1') where id=$1",[id]);await login(a);r=await act(id,{type:'place',piece:0,row:0,col:0,move_id:crypto.randomUUID()});assert.equal(r.match.status,'won');assert.equal(r.match.winner,0);await login(b);const finished=await act(id,{type:'place',piece:0,row:0,col:0,move_id:crypto.randomUUID()});assert.equal(finished.match.state.pieces[1],0);
    await login(a);r=await start({...defaultHeartOptions,mode:'endless'});id=r.match.id;await admin("update block_matches set created_at=clock_timestamp()-interval '25 hours' where id=$1",[id]);await login(a);r=await act(id,{type:'get'});assert.equal(r.match.status,'draw');
  } finally {
    await db.close();
  }
});
