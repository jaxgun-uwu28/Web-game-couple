import { aiAuth, aiError } from "@/lib/ai/auth";
import { aiStatus, contentPack } from "@/lib/ai/service";
export const runtime = "nodejs";
export const maxDuration = 20;
export async function GET(req: Request) {
  try {
    const { admin, coupleId } = await aiAuth(req);
    return Response.json(await aiStatus(admin, coupleId), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return aiError(e);
  }
}
export async function POST(req: Request) {
  try {
    const { admin, member, coupleId } = await aiAuth(req);
    const text = await req.text();
    if (text.length > 500)
      return Response.json({ error: "Request too large." }, { status: 400 });
    const body = JSON.parse(text);
    if (body.action === "settings") {
      if (typeof body.enabled !== "boolean")
        return Response.json(
          { error: "Choose an AI setting." },
          { status: 400 },
        );
      const { error } = await member.rpc("set_ai_questions", {
        enabled: body.enabled,
        tz: body.timezone || null,
      });
      if (error)
        return Response.json(
          {
            error:
              "Your setting could not save. Choose a valid timezone and retry.",
          },
          { status: 400 },
        );
      return Response.json(await aiStatus(admin, coupleId));
    }
    return Response.json(await contentPack(admin, coupleId), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return aiError(e);
  }
}
