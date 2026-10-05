import { z } from "zod";
export const triviaSchema = z.object({
  question: z.string().trim().min(8).max(139),
  options: z
    .array(z.string().trim().min(1).max(49))
    .length(4)
    .refine((a) => new Set(a.map((x) => x.toLowerCase())).size === 4),
  correctIndex: z.number().int().min(0).max(3),
  funFact: z.string().trim().min(5).max(220),
});
export const dailySchema = z.object({
  text: z.string().trim().min(8).max(89),
  mood: z.enum([
    "cozy",
    "silly",
    "dreamy",
    "nostalgic",
    "deep",
    "future",
    "food",
    "travel",
    "gratitude",
  ]),
});
export const choiceSchema = z
  .object({
    optionA: z.string().trim().min(3).max(39),
    optionB: z.string().trim().min(3).max(39),
  })
  .refine((p) => p.optionA.toLowerCase() !== p.optionB.toLowerCase());
export type TriviaQuestion = z.infer<typeof triviaSchema>;
export function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}
// Normalized stems ARE the history hashes: collisions cannot silently hide another question.
export function questionHash(value: string) {
  return normalize(value);
}
export function similar(a: string, b: string) {
  const aa = new Set(normalize(a).split(" ")),
    bb = new Set(normalize(b).split(" "));
  const common = [...aa].filter((w) => bb.has(w)).length;
  return common / Math.max(aa.size, bb.size) >= 0.82;
}
export function uniqueQuestions(items: TriviaQuestion[], history: string[]) {
  const stems = [...history];
  return items.filter((q) => {
    if (
      stems.some(
        (h) =>
          questionHash(h) === questionHash(q.question) ||
          similar(h, q.question),
      )
    )
      return false;
    stems.push(q.question);
    return true;
  });
}
export function readJSON(text: string) {
  return JSON.parse(
    text
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, ""),
  );
}
export function validatedItems<T>(schema: z.ZodType<T>, items: unknown) {
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => {
    const p = schema.safeParse(item);
    return p.success ? [p.data] : [];
  });
}
export const triviaResponseSchema = {
  type: "OBJECT",
  properties: {
    topic: { type: "STRING" },
    questions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          question: { type: "STRING" },
          options: {
            type: "ARRAY",
            items: { type: "STRING" },
            minItems: 4,
            maxItems: 4,
          },
          correctIndex: { type: "INTEGER" },
          funFact: { type: "STRING" },
        },
        required: ["question", "options", "correctIndex", "funFact"],
      },
    },
  },
  required: ["topic", "questions"],
};
export const contentResponseSchema = {
  type: "OBJECT",
  properties: {
    dailyQuestions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { text: { type: "STRING" }, mood: { type: "STRING" } },
        required: ["text", "mood"],
      },
    },
    wouldYouRather: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          optionA: { type: "STRING" },
          optionB: { type: "STRING" },
        },
        required: ["optionA", "optionB"],
      },
    },
  },
  required: ["dailyQuestions", "wouldYouRather"],
};
