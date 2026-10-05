import { dayIndex, manilaDay } from "./games";
import { seedDaily, seedChoices } from "./ai/content-seeds";
export const connectionChoices = [
  ["Sunrise walk", "Sunset picnic"],
  ["Cook together", "Try a new restaurant"],
  ["A quiet weekend", "A little adventure"],
  ["Plan every detail", "See where the day goes"],
  ["A handwritten note", "A surprise playlist"],
  ["Revisit a favorite place", "Explore somewhere new"],
  ["Learn a skill together", "Make something together"],
];
export const moodLabels = {
  happy: "Happy",
  calm: "Calm",
  tired: "Tired",
  stressed: "Stressed",
  low: "Low",
};
export type Mood = keyof typeof moodLabels;
export type ConnectionAnswer = { user_id: string; answer: string | null };
export type MoodCheckin = {
  user_id: string;
  day: string;
  mood: Mood;
  note: string;
  updated_at: string;
};
export type ConnectionTap = {
  id: string;
  sender: string;
  recipient: string;
  created_at: string;
};
export type ConnectionState = {
  day: string;
  server_now: string;
  daily: ConnectionAnswer[];
  choice: ConnectionAnswer[];
  streak: number;
  matches: number;
  total: number;
  moods: MoodCheckin[];
  taps: ConnectionTap[];
};
export function connectionPrompts(day: string) {
  const index = dayIndex(day);
  return {
    daily: seedDaily[index % seedDaily.length].text,
    choice: [
      seedChoices[index % seedChoices.length].optionA,
      seedChoices[index % seedChoices.length].optionB,
    ],
  };
}
export function emptyConnectionState(): ConnectionState {
  return {
    day: manilaDay(),
    server_now: new Date().toISOString(),
    daily: [],
    choice: [],
    streak: 0,
    matches: 0,
    total: 0,
    moods: [],
    taps: [],
  };
}
export function sealedAnswers(answers: ConnectionAnswer[], myId: string) {
  return answers.map((a) => ({
    ...a,
    answer: answers.length === 2 || a.user_id === myId ? a.answer : null,
  }));
}
