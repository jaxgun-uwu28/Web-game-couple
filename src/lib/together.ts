export const conversationQuestions = [
  "What ordinary moment would you like us to repeat?",
  "When do you feel most understood?",
  "What small kindness stayed with you?",
  "What would a perfect unhurried day look like?",
  "What is something you want to learn together?",
  "Which place makes you feel at home?",
  "What part of your week deserves a little celebration?",
  "What helps you feel safe when life gets loud?",
  "What would you put in a time capsule for us?",
  "What is a dream you have not talked about much?",
  "Which little ritual could we start?",
  "What do you wish people understood about you?",
  "What does support look like on a hard day?",
  "What memory always makes you laugh?",
  "What did you love doing as a child?",
  "Which skill would you happily teach me?",
  "What have you changed your mind about recently?",
  "What makes an apology feel sincere to you?",
  "What adventure would you choose with no pressure to be good at it?",
  "What is a personal achievement you quietly treasure?",
  "How can we make room for each other’s alone time?",
  "What do you value about the way we communicate?",
  "What feels like a meaningful gift to you?",
  "Which meal would you like to make together?",
  "What is something you are looking forward to?",
  "What can we simplify in our everyday life?",
  "What is one thing you want to ask me?",
  "When have you felt proud of us?",
  "What would you tell our future selves?",
  "How do you like to reconnect after a busy week?",
  "What does a peaceful home feel like?",
  "What is a challenge we could face as a team?",
  "Which shared memory deserves a drawing?",
  "What do you appreciate that you rarely say aloud?",
  "What promise can we realistically keep this month?",
  "What would you like the next chapter of us to feel like?",
];
export type Activity = {
  id: string;
  kind: "date" | "countdown" | "question" | "stake";
  body: {
    title?: string;
    date?: string;
    mood?: string;
    weather?: string;
    event?: string;
    index?: number;
    forfeit?: string;
  };
  done: boolean;
  created_at: string;
};
export type Progress = {
  played: number;
  wins: number;
  xp: number;
  coins: number;
  by_kind: Record<string, number>;
};
export const noProgress: Progress = {
  played: 0,
  wins: 0,
  xp: 0,
  coins: 0,
  by_kind: {},
};
export function countdownProgress(
  created: string,
  target: string,
  today: string,
) {
  if (!validCountdownDate(target) || !validCountdownDate(today) || !validCountdownDate(created.slice(0, 10))) return 0;
  const start = Date.parse(created.slice(0, 10) + "T12:00:00Z"),
    end = Date.parse(target + "T12:00:00Z"),
    now = Date.parse(today + "T12:00:00Z");
  return Math.max(
    0,
    Math.min(
      1,
      end <= start ? Number(now >= end) : (now - start) / (end - start),
    ),
  );
}
export function validCountdownDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T12:00:00Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
export function filterDates(items: Activity[], mood: string, weather: string) {
  return items.filter(
    (a) =>
      a.kind === "date" &&
      a.body.event === "idea" &&
      !a.done &&
      (mood === "any" || a.body.mood === "any" || a.body.mood === mood) &&
      (weather === "any" ||
        a.body.weather === "any" ||
        a.body.weather === weather),
  );
}
