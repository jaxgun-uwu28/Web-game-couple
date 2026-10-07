import knowFixture from "../../fixtures/gemini/know.json";
import drawFixture from "../../fixtures/gemini/draw.json";
import { type Game, type GameKind } from "./games";
export const triviaV2 = [
  {
    q: "Which planet has the most prominent rings?",
    options: ["Mars", "Saturn", "Venus", "Mercury"],
  },
  {
    q: "Which gas do plants absorb for photosynthesis?",
    options: ["Oxygen", "Helium", "Carbon dioxide", "Hydrogen"],
  },
  {
    q: "Which ocean is the largest?",
    options: ["Pacific", "Atlantic", "Indian", "Arctic"],
  },
  {
    q: "Which part holds a computer’s temporary working data?",
    options: ["SSD", "CPU", "GPU", "RAM"],
  },
  {
    q: "What is the largest organ of the human body?",
    options: ["Heart", "Skin", "Liver", "Lungs"],
  },
];
export const knowV2 = [
  {
    q: "A perfect slow evening starts with…",
    options: ["A film", "A conversation", "A game", "Making something"],
  },
  {
    q: "A surprise I would love most…",
    options: [
      "A thoughtful note",
      "A day out",
      "Something handmade",
      "A quiet meal",
    ],
  },
  {
    q: "When I need comfort, I prefer…",
    options: [
      "A hug",
      "Time to talk",
      "A little space",
      "Something to laugh at",
    ],
  },
  {
    q: "If we had a free afternoon…",
    options: [
      "Explore somewhere",
      "Make something",
      "Stay in together",
      "Try something new",
    ],
  },
  {
    q: "A small thing I notice most…",
    options: [
      "Kind words",
      "Help without asking",
      "Time together",
      "Little surprises",
    ],
  },
];
export const drawingWords = ["cloud", "flower", "boat", "star", "moon", "bird"];
export function extraGame(kind: GameKind, artist = 0): Game {
  return {
    id: crypto.randomUUID(),
    kind,
    state: {
      status: "playing",
      turn: 0,
      winner: null,
      round: 0,
      scores: [0, 0],
      submitted: [],
      artist,
      guesses: [],
      pack: "general-v2",
    },
  };
}
export function extraMove(
  game: Game,
  slot: number,
  action: Record<string, unknown>,
  answers: Record<number, Record<string, string>>,
  secret: string,
): Game {
  const g = structuredClone(game),
    s = g.state;
  if (s.status !== "playing") throw new Error("This game is finished.");
  if (g.kind === "draw") {
    if (s.round_seconds) {
      if (action.type === "next") {
        if (s.phase !== "round_done")
          throw new Error("Finish this round first.");
        s.round++;
        s.artist = 1 - s.artist!;
        s.phase = "drawing";
        s.guesses = [];
        s.round_ends_at = new Date(
          Date.now() + s.round_seconds * 1000,
        ).toISOString();
        delete s.last_word;
        return g;
      }
      if (action.type === "ready" && !s.round_ends_at) {
        s.round_ends_at = new Date(
          Date.now() + s.round_seconds * 1000,
        ).toISOString();
        return g;
      }
      if (s.phase !== "drawing") throw new Error("Start the next round.");
      const expired =
        !!s.round_ends_at && Date.now() >= Date.parse(s.round_ends_at);
      if (action.type === "timeout" && !expired)
        throw new Error("This round has not expired.");
      if (!expired && slot === s.artist)
        throw new Error("The artist cannot guess.");
      const guess = String(action.guess || "").trim();
      if (!expired && (!guess || guess.length > 60))
        throw new Error("Write a short guess.");
      if (!expired) s.guesses = [...(s.guesses || []), guess];
      if (expired || guess.toLowerCase() === secret || s.guesses!.length >= 5) {
        const winner =
          !expired && guess.toLowerCase() === secret ? slot : s.artist!;
        s.scores[winner]++;
        s.phase = "round_done";
        s.last_word = secret;
        if (s.round + 1 >= (s.count || 5)) {
          s.status = s.scores[0] === s.scores[1] ? "draw" : "won";
          s.winner =
            s.scores[0] === s.scores[1]
              ? null
              : s.scores[0] > s.scores[1]
                ? 0
                : 1;
          s.word = secret;
        }
      }
      return g;
    }
    if (slot === s.artist) throw new Error("The artist cannot guess.");
    const guess = String(action.guess || "").trim();
    if (!guess || guess.length > 60) throw new Error("Write a short guess.");
    s.guesses = [...(s.guesses || []), guess];
    if (guess.toLowerCase() === secret || s.guesses.length >= 5) {
      s.status = "won";
      s.winner = guess.toLowerCase() === secret ? slot : s.artist!;
      s.word = secret;
    }
    return g;
  }
  if (answers[slot]) throw new Error("Your answer is already sealed.");
  const keys = g.kind === "know" ? ["self", "guess"] : ["answer"];
  for (const key of keys)
    if (!["0", "1", "2", "3"].includes(String(action[key])))
      throw new Error("Choose an answer.");
  answers[slot] = Object.fromEntries(keys.map((k) => [k, String(action[k])]));
  s.submitted = Object.keys(answers).map(Number);
  if (answers[0] && answers[1]) {
    const correct = ["1", "2", "0", "3", "1"][s.round];
    s.scores = s.scores.map(
      (score, i) =>
        score +
        Number(
          g.kind === "know"
            ? answers[i].guess === answers[1 - i].self
            : answers[i].answer === correct,
        ),
    );
    s.last = { answers: [answers[0], answers[1]], correct };
    s.round++;
    s.submitted = [];
    delete answers[0];
    delete answers[1];
    if (s.round === 5) {
      s.status = s.scores[0] === s.scores[1] ? "draw" : "won";
      s.winner =
        s.scores[0] === s.scores[1] ? null : s.scores[0] > s.scores[1] ? 0 : 1;
    }
  }
  return g;
}

type ExtraPreview = {
  game: Game;
  words?: string[];
  secret: string;
  answers: Record<number, Record<string, string>>;
  strokes: import("../components/Doodle").Stroke[];
};
const previews = new Map<GameKind, ExtraPreview>();
export function startExtraPreview(kind: GameKind, rounds = 5, seconds = 60) {
  const old = previews.get(kind);
  if (old?.game.state.status === "playing") return old;
  const next = {
    game: extraGame(kind, old?.game.state.artist === 0 ? 1 : 0),
    words: drawFixture.items.slice(0, rounds).map((x) => x.word),
    secret:
      drawFixture.items[Math.floor(Math.random() * drawFixture.items.length)]
        .word,
    answers: {},
    strokes: [],
  };
  if (kind === "draw") {
    next.secret = next.words[0];
    Object.assign(next.game.state, {
      count: rounds,
      round_seconds: seconds,
      phase: "drawing",
      round_ends_at: null,
    });
  }
  if (kind === "know")
    next.game.state.questions = knowFixture.items
      .slice(0, 5)
      .map((q, i) => ({ ...q, id: String(i) }));
  previews.set(kind, next);
  return next;
}
export function updateExtraPreview(
  kind: GameKind,
  change: Partial<ExtraPreview>,
) {
  const current = previews.get(kind);
  if (current) Object.assign(current, change);
}
export function resetExtraPreviews() {
  previews.clear();
}
