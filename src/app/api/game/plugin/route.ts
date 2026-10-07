import { createHmac, randomInt, randomUUID } from "node:crypto";
import { serverUser, routeError } from "@/lib/server-user";
import { plugin, isPlugin } from "@/lib/plugin-games/registry";
import type { Config, Seat } from "@/lib/plugin-games/types";
import type { LedgerState } from "@/lib/plugin-games/ledger";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    const { user, profile, admin } = await serverUser(req, true),
      db = admin!;
    const raw = await req.text();
    if (raw.length > 8192) throw new Error("Request too large.");
    const b = JSON.parse(raw);
    if (b.action === "list") {
      const r = await db
        .from("arcade_matches")
        .select("*")
        .eq("couple_id", profile.couple_id)
        .order("created_at", { ascending: false })
        .limit(30);
      if (r.error) throw r.error;
      return Response.json({ matches: r.data });
    }
    let id = String(b.id || "");
    if (b.action === "create") {
      if (!isPlugin(b.game)) throw new Error("Unknown game.");
      const m = plugin(b.game),
        config: Config = {};
      for (const [key, choices] of Object.entries(m.setup)) {
        const value = b.config?.[key] ?? choices[0];
        if (!choices.includes(value)) throw new Error(`Choose a valid ${key}.`);
        config[key] = value;
      }
      if (b.game === "lostfound" && Array.isArray(b.config?.words))
        config.words = b.config.words
          .slice(0, 64)
          .map((x: unknown) => String(x).slice(0, 30));
      const existing = await db
        .from("arcade_matches")
        .select("id")
        .eq("couple_id", profile.couple_id)
        .eq("game_id", b.game)
        .in("status", ["invited", "waiting", "playing"])
        .maybeSingle();
      if (existing.data) id = existing.data.id;
      else {
        if (b.game === "syncsteps" && config.daily) {
          config.day = new Date().toISOString().slice(0,10);
          config.infinite = true;
          config.difficulty = 2;
        }
        const seed = b.game === 'syncsteps' && config.daily
          ? createHmac('sha256',process.env.SUPABASE_SERVICE_ROLE_KEY!).update(`${profile.couple_id}:${config.day}:syncsteps`).digest().readUInt32BE(0) & 0x7fffffff
          : randomInt(0, 2147483647),
          state = m.createMatch(config, seed);
        const created = await db.rpc("create_plugin_match", {
          mid: randomUUID(),
          uid: user.id,
          gid: b.game,
          cfg: config,
          match_seed: seed,
          engine: state,
        });
        if (created.error) throw created.error;
        id = created.data;
      }
    }
    const room = await db
      .from("arcade_matches")
      .select("*")
      .eq("id", id)
      .eq("couple_id", profile.couple_id)
      .single();
    if (room.error) throw new Error("Match unavailable.");
    const r = room.data,
      m = plugin(r.game_id),
      playersResult = await db
        .from("arcade_match_players")
        .select("user_id,seat,seen_at,score")
        .eq("match_id", id),
      players = playersResult.data || [],
      p = players.find((x) => x.user_id === user.id);
    if (!p) throw new Error("403:This is not your match.");
    await db
      .from("arcade_match_players")
      .update({ seen_at: new Date().toISOString() })
      .eq("match_id", id)
      .eq("user_id", user.id);
    if (b.action === "claim") {
      const claimed = await db.rpc("claim_plugin_win", {
        mid: id,
        uid: user.id,
      });
      if (claimed.error) throw claimed.error;
      r.status = "done";
      r.winner_id = user.id;
    } else if (b.action === "cancel" || b.action === "decline") {
      if (["invited", "waiting", "playing"].includes(r.status)) {
        const changed = await db.rpc("cancel_plugin_match", {
          mid: id,
          uid: user.id,
          decline: b.action === "decline",
        });
        if (changed.error) throw changed.error;
        r.status = b.action === "cancel" ? "cancelled" : "declined";
      }
    } else if (
      b.action === "accept" &&
      r.status === "invited" &&
      user.id !== r.host
    ) {
      await db
        .from("arcade_matches")
        .update({ status: "waiting" })
        .eq("id", id)
        .eq("status", "invited");
      r.status = "waiting";
    } else if (b.action === "ready") {
      if (r.status === "invited")
        throw new Error("Partner must accept the challenge first.");
      if (r.status !== "waiting") throw new Error("This lobby is closed.");
      const ready = [...new Set([...r.ready, user.id])],
        both =
          ready.length === 2 &&
          players.every(
            (x) =>
              x.user_id === user.id ||
              Date.now() - Date.parse(x.seen_at) < 20000,
          );
      const update = await db
        .from("arcade_matches")
        .update({
          ready,
          status: both ? "playing" : "waiting",
          started_at: both ? new Date().toISOString() : null,
          revision: r.revision + 1,
        })
        .eq("id", id)
        .eq("revision", r.revision)
        .select()
        .maybeSingle();
      if (!update.data) throw new Error("Lobby changed. Try Ready again.");
      Object.assign(r, update.data);
    }
    const secret = await db
      .from("arcade_private_states")
      .select("state")
      .eq("match_id", id)
      .single();
    if (secret.error) throw new Error("Match state unavailable.");
    let state = secret.data.state;
    const deadline = state.turnExpiresAt,
      timedOut =
        r.game_id === "lostfound" &&
        r.status === "playing" &&
        deadline &&
        Date.parse(deadline) < Date.now();
    if (b.action === "move" && b.move?.type === "timeout" && !timedOut)
      throw new Error("This turn has not expired.");
    if (timedOut) {
      b.action = "move";
      b.move = { type: "timeout" };
      b.requestId = randomUUID();
    }
    const duplicate = b.requestId
      ? await db
          .from("arcade_match_moves")
          .select("request_id")
          .eq("match_id", id)
          .eq("request_id", b.requestId)
          .maybeSingle()
      : null;
    if (b.action === "move" && !duplicate?.data) {
      if (r.status !== "playing")
        throw new Error("Both players must accept and be ready.");
      if (
        !timedOut &&
        players.some(
          (x) =>
            x.user_id !== user.id && Date.now() - Date.parse(x.seen_at) > 60000,
        )
      )
        throw new Error("Partner is reconnecting. Wait or end this match.");
      const move = { ...b.move };
      move.serverNow = Date.now();
      if(move.type==='powerup'&&r.game_id==='lostfound')move.axis=randomInt(0,2)?'row':'column';
      if (r.game_id === "ledger") {
        const max =
          r.config.duel === "d20" ? 20 : r.config.duel === "d6" ? 6 : 13;
        const draw = () => {
          if (r.config.duel !== "card")
            return [randomInt(1, max + 1), randomInt(1, max + 1)];
          const first = randomInt(0, 52);
          let second = randomInt(0, 51);
          if (second >= first) second++;
          return [(first % 13) + 2, (second % 13) + 2];
        };
        move.serverValues = draw();
        const st = state as LedgerState;
        if (
          st.wallets.reduce((a, b) => a + b, 0) - Number(move.coins || 0) ===
          0
        )
          while (move.serverValues[0] === move.serverValues[1])
            move.serverValues = draw();
      }
      const next = m.applyMove(state as never, move, p.seat as Seat),
        done = m.isOver(next as never),
        result = m.getResult(next as never),
        winner =
          result.winner === null
            ? null
            : players.find((x) => x.seat === result.winner)?.user_id;
      const commit = await db.rpc("commit_plugin_move", {
        mid: id,
        uid: user.id,
        expected: r.revision,
        rid: b.requestId || randomUUID(),
        payload: move,
        next_state: next,
        next_status: done ? "done" : "playing",
        winner,
        scores: result.scores,
      });
      if (commit.error) throw commit.error;
      if (!commit.data)
        throw new Error("Match changed. Refresh and try again.");
      const saved = await db
        .from("arcade_private_states")
        .select("state")
        .eq("match_id", id)
        .single();
      state = saved.data?.state || next;
      const updated = await db
        .from("arcade_matches")
        .select("*")
        .eq("id", id)
        .single();
      if (updated.data) Object.assign(r, updated.data);
    }
    return Response.json({
      serverTime: new Date().toISOString(),
      match: r,
      state: m.getPublicState(state as never, p.seat as Seat),
      seat: p.seat,
      players: players.map((x) => ({
        user_id: x.user_id,
        seat: x.seat,
        seen_at: x.user_id === user.id ? new Date().toISOString() : x.seen_at,
      })),
      result:
        r.status === "done"
          ? m.isOver(state as never)
            ? m.getResult(state as never)
            : {
                winner:
                  players.find((x) => x.user_id === r.winner_id)?.seat ?? null,
                scores: players.map((x) => (x.user_id === r.winner_id ? 1 : 0)),
                reason: "Reconnect time ended",
              }
          : null,
    });
  } catch (e) {
    return routeError(e);
  }
}
