import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual, createHash } from "node:crypto";
import { isQuietHour, permittedPushEndpoint } from "@/lib/push";
export const runtime = "nodejs";
export async function POST(req: Request) {
  const secret = process.env.PUSH_WEBHOOK_SECRET,
    provided = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (
    !secret ||
    !provided ||
    Buffer.byteLength(secret) !== Buffer.byteLength(provided) ||
    !timingSafeEqual(Buffer.from(secret), Buffer.from(provided))
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    return Response.json(
      { error: "Push server is not configured." },
      { status: 503 },
    );
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );
  try {
    const text = await req.text();
    if (text.length > 65536) throw new Error("Payload too large");
    const event = JSON.parse(text),
      table = String(event.table),
      id = event.record?.id;
    if (
      ![
        "wishlist_items",
        "memories",
        "love_notes",
        "connection_taps",
        "games",
      ].includes(table) ||
      !id
    )
      return Response.json({ ignored: true });
    let type = "wishes",
      couple: string,
      author: string;
    const rowResult = await db.from(table).select("*").eq("id", id).single();
    if (rowResult.error) return Response.json({ ignored: true });
    const row = rowResult.data;
    if (table === "wishlist_items") {
      const r = await db
        .from("wishlists")
        .select("*")
        .eq("id", row.list_id)
        .single();
      if (r.error || r.data.type === "secret")
        return Response.json({ ignored: true });
      couple = r.data.couple_id;
      author = row.created_by;
      if (
        event.type !== "INSERT" &&
        !(
          event.type === "UPDATE" &&
          row.status === "done" &&
          event.old_record?.status !== "done"
        )
      )
        return Response.json({ ignored: true });
    } else if (table === "games") {
      couple = row.couple_id;
      const r = await db
        .from("profiles")
        .select("id")
        .eq("couple_id", couple)
        .eq("slot", Number(row.state.turn))
        .single();
      if (r.error) return Response.json({ ignored: true });
      author = "";
      type = "turns";
      if (
        event.type !== "UPDATE" ||
        row.state.status !== "playing" ||
        event.old_record?.state?.turn === row.state.turn
      )
        return Response.json({ ignored: true });
    } else {
      couple = row.couple_id;
      author = row.author || row.sender;
      type =
        table === "memories"
          ? "memories"
          : table === "love_notes"
            ? "notes"
            : "taps";
      if (event.type !== "INSERT") return Response.json({ ignored: true });
    }
    const profiles = await db
      .from("profiles")
      .select("id,slot")
      .eq("couple_id", couple);
    const recipients = (profiles.data || []).filter((p) =>
      table === "games" ? p.slot === Number(row.state.turn) : p.id !== author,
    );
    const eventKey = createHash("sha256")
      .update(
        `${table}:${id}:${type}:${event.type}:${table === "games" ? JSON.stringify(row.state) : row.status || ""}`,
      )
      .digest("hex");
    const claimed = await db
      .from("push_deliveries")
      .insert({ event_key: eventKey });
    if (claimed.error?.code === "23505")
      return Response.json({ duplicate: true });
    if (claimed.error) throw claimed.error;
    let sent = 0;
    for (const recipient of recipients) {
      const preference = await db
        .from("notification_preferences")
        .select("*")
        .eq("user_id", recipient.id)
        .maybeSingle();
      const p = preference.data;
      if (
        !p?.enabled ||
        !p[type] ||
        isQuietHour(new Date(), p.quiet_start, p.quiet_end, p.timezone)
      )
        continue;
      const devices = await db
        .from("push_devices")
        .select("*")
        .eq("user_id", recipient.id);
      for (const device of devices.data || []) {
        try {
          if (device.platform === "web") {
            const subscription = device.json_subscription;
            if (
              !subscription ||
              !permittedPushEndpoint(subscription.endpoint) ||
              !process.env.VAPID_PRIVATE_KEY ||
              !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
            )
              continue;
            const webpush = (await import("web-push")).default;
            await webpush.sendNotification(
              subscription,
              JSON.stringify({ type }),
              {
                vapidDetails: {
                  subject:
                    process.env.VAPID_SUBJECT || "mailto:admin@example.com",
                  publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
                  privateKey: process.env.VAPID_PRIVATE_KEY,
                },
              },
            );
          } else {
            if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) continue;
            const { getApps, initializeApp, cert } =
              await import("firebase-admin/app");
            const app =
              getApps()[0] ||
              initializeApp({
                credential: cert(
                  JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON),
                ),
              });
            const { getMessaging } = await import("firebase-admin/messaging");
            await getMessaging(app).send({
              token: device.token,
              notification: {
                title: "Our Little Arcade",
                body: "Your person left a little something for you.",
              },
              data: { type },
              android: {
                priority: "high",
                notification: { channelId: "little-updates" },
              },
            });
          }
          sent++;
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode,
            code = (e as { code?: string }).code;
          if (
            [404, 410].includes(status || 0) ||
            [
              "messaging/registration-token-not-registered",
              "messaging/invalid-registration-token",
            ].includes(code || "")
          )
            await db.from("push_devices").delete().eq("id", device.id);
        }
      }
    }
    return Response.json({ sent });
  } catch {
    return Response.json(
      { error: "Notification delivery could not be processed." },
      { status: 500 },
    );
  }
}
