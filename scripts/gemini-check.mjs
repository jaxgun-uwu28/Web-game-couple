// Owner-run only. One tiny live call, no retries, no key or response logging.
import { loadEnvConfig } from "@next/env";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
loadEnvConfig(process.cwd());
const key = process.env.GEMINI_API_KEY,
  model = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
if (!key) {
  console.error("GEMINI_API_KEY is missing. Add it to .env.local.");
  process.exit(1);
}
if (!/^[a-zA-Z0-9._-]+$/.test(model)) {
  console.error("GEMINI_MODEL is invalid.");
  process.exit(1);
}
const prompt = 'Return JSON {"ok":true}.';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    "Add the server Supabase key and apply migration 009 first, so the live check respects your shared budget.",
  );
  process.exit(1);
}
const db = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const cap = (name, max) => {
  const n = Number(process.env[name] ?? max);
  return Number.isFinite(n) ? Math.max(0, Math.min(max, Math.floor(n))) : max;
};
const { data: reserved, error: budgetError } = await db.rpc("ai_reserve", {
  model_name: model,
  rpm: cap("GEMINI_RPM_LIMIT", 4),
  budget: cap("GEMINI_DAILY_BUDGET", 60),
});
if (budgetError || !reserved) {
  console.error(
    "The shared request budget is unavailable or paused. No Gemini request was made.",
  );
  process.exit(1);
}
try {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 40,
          responseMimeType: "application/json",
          ...(model.startsWith("gemini-2.5-")
            ? { thinkingConfig: { thinkingBudget: 0 } }
            : {}),
        },
      }),
    },
  );
  if (!response.ok) {
    console.error(
      `Gemini check failed: HTTP ${response.status}. Check your model and Free-plan quota in AI Studio.`,
    );
    process.exit(1);
  }
  const data = await response.json();
  if (data.candidates?.[0]?.finishReason !== "STOP") throw new Error();
  await mkdir(".cache/gemini", { recursive: true });
  await writeFile(
    `.cache/gemini/${createHash("sha256")
      .update(model + prompt)
      .digest("hex")}.json`,
    JSON.stringify(data),
  );
  console.log(`Gemini key works. Model: ${model}. One request used.`);
} catch {
  console.error("Gemini check could not complete. No retry was made.");
  process.exit(1);
}
