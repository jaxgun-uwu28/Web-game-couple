import { secureDeck } from "@/lib/cards";
import { createHmac, randomInt, randomUUID } from "node:crypto";
import { serverUser, routeError } from "@/lib/server-user";
import { plugin, isPlugin } from "@/lib/plugin-games/registry";
import type { Config, Seat } from "@/lib/plugin-games/types";
import type { LedgerState } from "@/lib/plugin-games/ledger";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    const {
        user,
        profile,
        admin,
        db: authenticated,
      } = await serverUser(req, true),
      db = admin!;
    const raw = await req.text();
    if (raw.length > 8192) throw new Error("Request too large.");
    const b = JSON.parse(raw);
    if (b.action === "list") {
      let query = db
        .from("arcade_matches")
        .select("*")
        .eq("couple_id", profile.couple_id);
      if (b.game && isPlugin(b.game))
        query = query
          .eq("game_id", b.game)
          .in("status", ["invited", "waiting", "playing"]);
      const r = await query.order("created_at", { ascending: false }).limit(30);
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
      if (existing.error) throw existing.error;
      if (existing.data) id = existing.data.id;
      else {
        if (b.game === "syncsteps" && config.daily) {
          config.day = new Date().toISOString().slice(0, 10);
          config.infinite = true;
          config.difficulty = 2;
        }
        const seed =
            b.game === "syncsteps" && config.daily
              ? createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY!)
                  .update(`${profile.couple_id}:${config.day}:syncsteps`)
                  .digest()
                  .readUInt32BE(0) & 0x7fffffff
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
    // Existing invitations become ordinary rooms on the first authorized visit.
    if (r.status === "invited") {
      const opened = await db
        .from("arcade_matches")
        .update({ status: "waiting" })
        .eq("id", id)
        .eq("status", "invited");
      if (opened.error) throw opened.error;
      const fresh = await db
        .from("arcade_matches")
        .select("*")
        .eq("id", id)
        .single();
      if (fresh.error) throw fresh.error;
      Object.assign(r, fresh.data);
    }
    await db
      .from("arcade_match_players")
      .update({ seen_at: new Date().toISOString() })
      .eq("match_id", id)
      .eq("user_id", user.id);
    if (b.action === "buyin") {
      const paid = await db.rpc("blackjack_buyin", {
        mid: id,
        uid: user.id,
        amount: b.move?.amount,
      });
      if (paid.error) throw paid.error;
      const fresh = await db
        .from("arcade_matches")
        .select("*")
        .eq("id", id)
        .single();
      Object.assign(r, fresh.data);
    }
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
    } else if (b.action === "ready") {
      if (r.status !== "waiting") throw new Error("This lobby is closed.");
      if (r.game_id === "blackjack") {
        const funded = await db
          .from("blackjack_players")
          .select("buy_in")
          .eq("session_id", id);
        if (funded.data?.length !== 2 || funded.data.some((x) => x.buy_in < 10))
          throw new Error("Both players must lock a buy-in first");
      }
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
          started_at: both ? new Date(Date.now() + 3000).toISOString() : null,
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
    if (b.action === "topup") {
      if (
        r.game_id !== "blackjack" ||
        r.status !== "waiting" ||
        state.buyIns[p.seat] > 0
      )
        throw new Error("Top-up is available before your buy-in only.");
      const topped = await authenticated.rpc("ledger_topup");
      if (topped.error) throw topped.error;
    }
    if (
      r.game_id === "blackjack" &&
      r.status === "playing" &&
      state.status === "buyin" &&
      Date.now() >= Date.parse(r.started_at)
    ) {
      b.action = "move";
      b.move = { type: "start" };
      b.requestId = randomUUID();
    }
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
    if (
      r.game_id === "ledger" &&
      b.move?.type === "reveal" &&
      !["flipping", "suspense"].includes(state.status)
    )
      b.action = "get";
    const blackjackTimeout =
      r.game_id === "blackjack" &&
      r.status === "playing" &&
      state.endsAt &&
      Date.now() >= state.endsAt;
    if (blackjackTimeout) {
      b.action = "move";
      b.move = { type: "end" };
      b.requestId = randomUUID();
    }
    const ledgerTimeout =
      r.game_id === "ledger" &&
      r.status === "playing" &&
      ((state.status === "flipping" && Date.now() >= state.flipDeadline) ||
        (state.status === "suspense" && Date.now() >= state.revealAt));
    if (ledgerTimeout) {
      b.action = "move";
      b.move = { type: "reveal" };
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
        throw new Error("Both players must be here and ready.");
      if (
        !timedOut &&
        !ledgerTimeout &&
        !blackjackTimeout &&
        players.some(
          (x) =>
            x.user_id !== user.id && Date.now() - Date.parse(x.seen_at) > 60000,
        )
      )
        throw new Error("Partner is reconnecting. Wait or end this match.");
      if (Date.now() < Date.parse(r.started_at))
        throw new Error("Ready countdown is still running");
      const move = { ...b.move };
      move.serverNow = Date.now();
      if (move.type === "powerup" && r.game_id === "lostfound")
        move.axis = randomInt(0, 2) ? "row" : "column";
      delete move.serverCards;
      delete move.serverValues;
      delete move.serverDeck;
      delete move.noteId;
      if (r.game_id === "blackjack") {
        if (
          ["match", "accept_note"].includes(move.type) &&
          state.pending?.kind === "match"
        )
          move.serverDeck = secureDeck();
        if (move.type === "stake_note") move.noteId = randomUUID();
      }
      if (r.game_id === "ledger" && move.type === "lock") {
        const max =
          r.config.duel === "d20" ? 20 : r.config.duel === "d6" ? 6 : 13;
        const draw = () => {
          if (r.config.duel !== "card")
            return [randomInt(1, max + 1), randomInt(1, max + 1)];
          const cards = secureDeck().slice(0, 2);
          move.serverCards = cards;
          return cards.map((c) => c.rank);
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
    let wallet: number | undefined;
    if (r.game_id === "blackjack") {
      const balance = await db
        .from("ledger_wallets")
        .select("balance")
        .eq("user_id", user.id)
        .single();
      if (balance.error || typeof balance.data?.balance !== "number")
        throw new Error(
          "Your wallet could not load. Refresh the room and try again.",
        );
      wallet = balance.data.balance;
      if (b.action === 'topup' && wallet < 10) throw new Error('Your daily top-up has already been used. End this room, then reset the wallets in the Promise Ledger.');
    }
    return Response.json({
      wallet,
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
