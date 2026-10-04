import { createClient } from "@supabase/supabase-js";
// node --env-file=.env.local scripts/seed.mjs (or export environment variables)
const env = process.env;
for (const key of [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "LANCE_EMAIL",
  "ELAINE_EMAIL",
])
  if (!env[key]) throw new Error(`Missing ${key}`);
const db = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const existing = await db.auth.admin.listUsers();
if (existing.error) throw existing.error;
for (const [slot, label, color] of [
  [0, "LANCE", "#262821"],
  [1, "ELAINE", "#344f3f"],
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
  const { error } = await db
    .from("profiles")
    .upsert({
      id: user.id,
      couple_id: "06092025-0000-4000-8000-000000000001",
      slot,
      name: label === "LANCE" ? "Lance" : "Elaine",
      color,
    });
  if (error) throw error;
  console.log(`${label} invitation ready`);
}
