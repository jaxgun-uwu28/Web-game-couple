import { aiAuth, aiError } from "@/lib/ai/auth";
import { startDuel } from "@/lib/ai/service";
import { cleanTopic, type DuelOptions } from "@/lib/ai/topics";
export const runtime = "nodejs";
export const maxDuration = 20;
export async function POST(req: Request) {
  try {
    const { member, admin, coupleId } = await aiAuth(req);
    const text = await req.text();
    if (text.length > 500)
      return Response.json({ error: "Request too large." }, { status: 400 });
    const body = JSON.parse(text);
    const options = { ...body.options, topic: cleanTopic(body.options?.topic) };
    const op = body.op === "start" ? "begin" : body.op;
    const { data: lobby, error } = await member.rpc("brain_lobby", {
      op,
      options,
    });
    if (error)
      return Response.json(
        {
          error: error.message.includes("brain_lobby")
            ? "The Brain Duel lobby migration needs to be applied in Supabase."
            : error.message,
        },
        { status: 400 },
      );
    if (body.op !== "start")
      return Response.json(lobby, { headers: { "Cache-Control": "no-store" } });
    try {
      const result = await startDuel(admin, coupleId, {
        topic: lobby.topic,
        count: lobby.count,
        difficulty: lobby.difficulty,
      } as DuelOptions);
      if (!result.game)
        throw new Error("The questions are still preparing. Retry shortly.");
      return Response.json({ ...lobby, status: "playing", game: result.game });
    } catch (e) {
      await member.rpc("brain_lobby", { op: "reset", options: {} });
      return Response.json(
        {
          error:
            e instanceof Error
              ? e.message
              : "Questions could not load. Retry the lobby.",
        },
        { status: 503 },
      );
    }
  } catch (e) {
    return aiError(e);
  }
}
