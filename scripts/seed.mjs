import { createClient } from "@supabase/supabase-js";
// node --env-file=.env.local scripts/seed.mjs (or export environment variables)
const env = process.env;
for (const key of [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PLAYER_ONE_EMAIL",
  "PLAYER_TWO_EMAIL",
])
  if (!env[key]) throw new Error(`Missing ${key}`);
const db = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const existing = await db.auth.admin.listUsers();
if (existing.error) throw existing.error;
const coupleId = env.COUPLE_ID || "06092025-0000-4000-8000-000000000001";
const couple = await db
  .from("couples")
  .select("id")
  .eq("id", coupleId)
  .single();
if (couple.error)
  throw new Error(
    "Create the couple record through the migration, or supply an existing COUPLE_ID.",
  );
for (const [slot, label, color] of [
  [0, "PLAYER_ONE", "#9d304f"],
  [1, "PLAYER_TWO", "#795562"],
]) {
  const email = env[`${label}_EMAIL`];
  let user = existing.data.users.find((u) => u.email === email);
  if (!user) {
    const result = await db.auth.admin.createUser({
      email,
      email_confirm: true,
      ...(env[`${label}_PASSWORD`]
        ? { password: env[`${label}_PASSWORD`] }
        : {}),
    });
    if (result.error) throw result.error;
    user = result.data.user;
  }
  const linked = await db
    .from("profiles")
    .select("id,couple_id,slot")
    .eq("id", user.id)
    .maybeSingle();
  if (linked.error) throw linked.error;
  if (linked.data) {
    if (linked.data.couple_id !== coupleId || linked.data.slot !== slot)
      throw new Error(
        "Existing account linkage differs; inspect it instead of transferring a seat.",
      );
    console.log(`${label} already linked`);
    continue;
  }
  const { error } = await db.from("profiles").insert({
    id: user.id,
    couple_id: coupleId,
    slot,
    name: `Player ${slot + 1}`,
    color,
  });
  if (error) throw error;
  console.log(`${label} invitation ready`);
}
