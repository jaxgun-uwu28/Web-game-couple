import { serverUser, routeError } from "@/lib/server-user";
export async function POST(req: Request) {
  try {
    const { db, admin, user, profile } = await serverUser(req, true);
    const { id, keep } = await req.json();
    if (typeof id !== "string" || typeof keep !== "boolean") throw new Error("Invalid postcard request.");
    const before = await admin!.from("postcards").select("sender_id,front_path,back_path,layers").eq("id",id).eq("couple_id",profile.couple_id).maybeSingle();
    if (before.error) throw before.error;
    if (before.data?.sender_id === user.id) throw new Error("Only the recipient can close this postcard.");
    const result = await db.rpc("finish_postcard",{i:id,keep});
    if (result.error) throw result.error;
    if (result.data && before.data) {
      const prefix = `${profile.couple_id}/${before.data.sender_id}/${id}/`;
      const paths = [before.data.front_path,before.data.back_path,before.data.layers?.photoPath].filter((p): p is string => typeof p === "string" && p.startsWith(prefix));
      if (paths.length) {
        const removed = await admin!.storage.from("postcards").remove(paths);
        if (removed.error) console.error("postcard_cleanup_failed",{id});
      }
    }
    return Response.json({deleted:Boolean(result.data)});
  } catch (error) { return routeError(error); }
}
