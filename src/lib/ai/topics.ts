export const topics = [
  "Surprise Mix",
  "General Knowledge",
  "Science",
  "Nature and Animals",
  "Space",
  "History",
  "Geography",
  "Movies and TV",
  "Music",
  "Food and Drink",
  "Sports",
  "Books and Stories",
  "Pop Culture",
  "Art and Design",
  "Technology",
] as const;
export function cleanTopic(value: unknown) {
  return (
    String(value ?? "Surprise Mix")
      .replace(/[\r\n]/g, " ")
      .replace(/[^\p{L}\p{N} &-]/gu, "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 40) || "Surprise Mix"
  );
}
export type DuelOptions = {
  topic: string;
  count: 3 | 5 | 10;
  difficulty: "Easy" | "Medium" | "Hard" | "Easy-Medium";
};
