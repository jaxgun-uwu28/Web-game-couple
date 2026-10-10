import { serverUser, routeError } from "@/lib/server-user";
export async function POST(req: Request) {
  try {
    const {admin,user,profile}=await serverUser(req,true);
    const {id}=await req.json();
    if(typeof id!=="string" || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Choose a photo to delete.");
    const removed=await admin!.from("memories").delete().eq("id",id).eq("author",user.id).eq("couple_id",profile.couple_id).select("image_path").maybeSingle();
    if(removed.error) throw removed.error;
    if(!removed.data) throw new Error("Photo unavailable or you do not own it.");
    const path=removed.data.image_path;
    if(typeof path==="string" && path.startsWith(`${profile.couple_id}/${user.id}/`)) {
      const references=await admin!.from("memories").select("id").eq("image_path",path).limit(1);
      if(!references.error && !references.data?.length) {
        const cleanup=await admin!.storage.from("keepsakes").remove([path]);
        if(cleanup.error) console.error("memory_file_cleanup_failed",{id});
      }
    }
    return Response.json({deleted:true});
  }catch(error){return routeError(error);}
}
