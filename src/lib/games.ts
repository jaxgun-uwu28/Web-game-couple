export const registry = [
  {
    id: "tic",
    name: "Tic-tac-toe",
    note: "A tiny game. A very serious rivalry.",
    icon: "grid",
  },
  {
    id: "connect",
    name: "Connect Four",
    note: "Four in a row, one bragging right.",
    icon: "circles",
  },
  {
    id: "draw",
    name: "Draw & guess",
    note: "Your art. My questionable guesses.",
    icon: "pencil",
  },
  {
    id: "know",
    name: "Know me by heart",
    note: "The little things only we know.",
    icon: "heart",
  },
  {
    id: "trivia",
    name: "A little brain duel",
    note: "For our curious sides.",
    icon: "brain",
  },
] as const;
export type GameKind = (typeof registry)[number]["id"];
export type Game = {
  id: string;
  kind: GameKind;
  state: {
    status: string;
    turn: number;
    board?: number[];
    winner: number | null;
    round: number;
    scores: number[];
    submitted?: number[];
    artist?: number;
    guesses?: string[];
    word?: string;
    last?: { answers: Record<string, string>[]; correct: string };
  };
};
export const trivia = [
  {
    q: "Which planet has the most prominent rings?",
    options: ["Mars", "Saturn", "Venus", "Mercury"],
  },
  {
    q: "What does the J in JDM stand for?",
    options: ["Junior", "Jet", "Japanese", "Joint"],
  },
  {
    q: "Which animal purrs to communicate and self-soothe?",
    options: ["Cat", "Dog", "Rabbit", "Fox"],
  },
  {
    q: "What stores a computer’s working data temporarily?",
    options: ["SSD", "CPU", "GPU", "RAM"],
  },
  {
    q: "What is sushi rice traditionally seasoned with?",
    options: ["Soy sauce", "Rice vinegar", "Milk", "Olive oil"],
  },
];
export const know = [
  {
    q: "A perfect slow evening starts with…",
    options: ["A movie", "A nap", "A game", "A sketchbook"],
  },
  {
    q: "If I could order only one…",
    options: ["Sushi", "Burgers", "Fresh bread", "Something new"],
  },
  {
    q: "Our next movie should be…",
    options: ["Horror", "Action", "Romcom", "A documentary"],
  },
  {
    q: "My dream afternoon is…",
    options: [
      "A cat café",
      "A JDM car meet",
      "Making art",
      "Staying in together",
    ],
  },
  {
    q: "My favorite little comfort is…",
    options: ["A long nap", "Learning something", "Good food", "Your company"],
  },
];
export const dailyQuestions = [
  "What little thing did I do that made you smile?",
  "What should we draw together next?",
  "Which memory of us would you turn into a movie?",
  "What is one thing you want us to learn together?",
  "What would our perfect rainy day look like?",
  "Where would you take me on a surprise date?",
  "What do you appreciate about us lately?",
];
export const choices = [
  ["Horror marathon", "Romcom & cuddles"],
  ["Sushi date", "Burger date"],
  ["Cat café", "Road trip"],
  ["Draw together", "Play together"],
  ["Fresh bread", "Midnight snacks"],
  ["Stay in & nap", "Go explore"],
  ["Action movie", "Science documentary"],
];
export function manilaDay(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export function dayIndex(day: string) {
  return Math.floor(Date.parse(`${day}T00:00:00Z`) / 86400000);
}
export function daysTogether(date = new Date()) {
  return Math.max(0, dayIndex(manilaDay(date)) - dayIndex("2025-09-06"));
}
export function boardWinner(
  board: number[],
  cols: number,
  needed: number,
): number | null {
  const rows = board.length / cols;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      for (const [dr, dc] of [
        [0, 1],
        [1, 0],
        [1, 1],
        [1, -1],
      ]) {
        const value = board[r * cols + c];
        if (!value) continue;
        if (
          r + (needed - 1) * dr >= rows ||
          c + (needed - 1) * dc < 0 ||
          c + (needed - 1) * dc >= cols
        )
          continue;
        if (
          Array.from(
            { length: needed },
            (_, i) => board[(r + i * dr) * cols + c + i * dc],
          ).every((x) => x === value)
        )
          return value - 1;
      }
  return null;
}
