# Connect the private accounts

The browser connection is already configured for the fresh project below. The remaining work uses its Supabase owner dashboard. Do not share service-role keys or passwords in chat.

## Current fresh project — use this path

The app now connects to `ohjeloskpjsynhbddgch.supabase.co`. The old project is no longer the configured backend; no migration was applied to it by Codex.

1. Select the **new project** in Supabase, open SQL Editor and run the entire `supabase/setup_fresh_project.sql` file once. This transaction includes migrations 001–003, starts with a blank anniversary and creates the private app-art bucket. Do not run the individual migrations afterward. If any statement fails, stop and share the error; the transaction rolls back.
   For a brand-new installation, then run migrations 004 (Block Hearts Duel) and 005 (connections) once, in that order. Existing installations should run only their unapplied updates.
2. In Authentication → URL Configuration set Site URL to `http://localhost:3000`, and allow `http://localhost:3000` and `http://localhost:3000/` as redirects. Keep Email enabled and disable public sign-ups.
3. Under Authentication → Users create or invite the two accounts using the supplied invitation emails. Copy their Auth user UUIDs and run the profile-linking insert in this guide, using slots 0 and 1 and the fixed initial couple ID.
4. Restart `npm run dev`, leave local preview and sign in using the existing account's email and password. Enter the anniversary in first-run setup. Repeat with the other account and check a shared game.

The sign-in form now uses email and password, with no public signup or invitation-link request. Only `lancerobertmacorol8@gmail.com` and `lancerobertmacorol4@gmail.com` are accepted by the app and game API. Both still need their linked private profiles. Use the passwords set when you created these Auth users; if those accounts do not yet have passwords, configure them through Supabase before testing. No new SQL migration is needed for this sign-in update. Game requests obtain the current session, refresh near-expired tokens and retry a rejected token once before any game move executes.

The publishable key configures the app but cannot run SQL or administer users. Complete dashboard steps as project owner. No custom exposed schema is needed on this fresh project. The audit instructions below apply only when diagnosing an existing installation.

If sign-in succeeds but games report verification unavailable, ensure the local `npm run dev` process has outbound network access to Supabase. A server launched inside a network-restricted execution sandbox cannot verify tokens even when the browser can sign in. Run it from your normal project terminal, or restart the verified development server with approved network access. Do not remove server verification to work around this.

## Check what is already installed

Open SQL Editor, create a query, and run this read-only check:

```sql
select
 to_regclass('public.couples') as couples,
 to_regclass('public.profiles') as profiles,
 to_regclass('public.games') as games,
 to_regclass('public.art_slots') as art_slots,
 to_regprocedure('public.set_anniversary(date)') as anniversary_function,
 to_regprocedure('public.set_nickname(text)') as nickname_function;
```

If all values are NULL, apply 001_arcade.sql, 002_stage_one.sql and 003_stage_two.sql in order. Copy each entire file into a separate SQL Editor query and Run it once. Stop on an error. These migrations are not intended to be rerun.

If tables already exist, inspect their schema and migration history first. Existing tables may come from an earlier installation or another schema version. Do not run 001 blindly. Share this check's output (it contains no credentials) to identify the next step. art_slots and set_anniversary indicate Stage 1 objects; set_nickname indicates Stage 2. Presence alone does not certify a complete migration.

## Configure authentication

Under Authentication → URL Configuration, use http://localhost:3000 as Site URL while testing locally. Add http://localhost:3000 and http://localhost:3000/ to Redirect URLs. After deployment use the actual HTTPS site as Site URL and add that URL to redirects. Localhost links work only on the computer running the app; phones need the deployed site or a reachable development address.

Under Authentication settings, keep Email enabled and disable public sign-ups. Under Authentication → Users, create the two accounts through Add user → Create new user. Enter each invitation email, choose its password privately and enable Auto Confirm User if available. The app signs in through an email link; passwords are not collected by its current screen. Alternatively invite users through the dashboard and complete their email confirmation.

Use the two emails supplied for the project. Elaine's current temporary address can be replaced with her own later through Auth. Do not create duplicate users if either already exists.

## Link their profiles

Copy each Auth user's UUID (ID), not the email address. First inspect existing links:

```sql
select id, anniversary from public.couples;
select id, couple_id, slot, name, nickname from public.profiles;
```

If both users already have the correct linked profiles, skip insertion. Otherwise use the initial migration's couple ID below, or replace it with the actual couple ID returned by the query. Replace the two placeholders with the real Auth UUIDs:

```sql
insert into public.profiles (id, couple_id, slot, name, color)
values
 ('FIRST_AUTH_USER_UUID', '06092025-0000-4000-8000-000000000001', 0, 'Player 1', '#9d304f'),
 ('SECOND_AUTH_USER_UUID', '06092025-0000-4000-8000-000000000001', 1, 'Player 2', '#795562');
```

This deliberately fails rather than overwriting an occupied seat. If a profile/seat exists, inspect it before changing account linkage. Both profiles share one couple ID and have distinct slots 0 and 1. Keep RLS enabled. Account sign-in alone does not grant access: these linked profiles authorize the private data and channels.

## Verify

Run npm run dev. Sign out of local preview, enter the first account's email and choose Send my private link. Open that email link on the same computer/browser. Set or edit the anniversary and an optional nickname. Repeat in another browser with the second account.

Open Play on both accounts and choose the same game. Check turn changes, a saved win and matching scoreboards. Then test a private Art Slots upload from one account and its appearance on the other. Use private Realtime channels; public channel access can be disabled in project Realtime settings. If magic-link delivery fails, inspect Auth email configuration and delivery limits and configure SMTP as needed. Never disable RLS or grant anonymous table access to fix sign-in.

The local preview works independently of Supabase and cannot confirm hosted setup. Stage 2's tests validate the SQL in embedded Postgres; hosted two-device acceptance remains a separate check.
# Block Hearts Duel update

Your fresh-project setup and two private accounts can remain as configured. Open `supabase/migrations/004_block_battle.sql`, copy the entire file into the new project's SQL Editor, and run it once. Do not rerun the combined fresh setup. This migration adds the private block matches, validated game functions, Realtime access and scoreboard totals.

After it succeeds, sign in on two devices. In Play, open Block Hearts Duel on both, choose a duration and create/join the duel, then press Ready on each account. Verify both clocks start together, scores update, and the result agrees when time expires. The publishable key cannot install this migration.

## Stage 3 update

Run the entire `supabase/migrations/005_connections.sql` file once in this project's SQL Editor. Existing profiles, passwords, anniversary and games are preserved. It adds couple-private moods, taps and validated connection functions; no signup or public read access is added.

Check Home on both accounts: submit one daily answer and one choice, confirm the other account cannot read those answers yet, then answer on the second account and check both reveals and the match percentage. Save and update a mood, confirm the partner sees its note and history. Send Thinking of you; check the receiving app while open and verify the sender's one-minute cooldown. Background push is not part of this stage.

## Stage 4 update

Run `supabase/migrations/006_keepsakes.sql` once after the earlier updates. It creates wishlists, private gift claims, photo memories and sealed note storage. The `keepsakes` Storage bucket stays private; signed URLs expire after five minutes. Do not rerun the initial setup or replace your accounts.

Check both accounts: shared lists permit edits by both, personal lists permit owner edits and private partner claims, and Secret Ideas remain visible only to their creator. Test a future-dated letter and one-sided daily photo swap before and after reveal. Direct table and Storage access obey the same restrictions. The local database tests cover these privacy boundaries; production acceptance still requires this migration and both accounts.
