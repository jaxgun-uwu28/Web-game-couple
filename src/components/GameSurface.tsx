"use client";
import { winningCells } from "@/lib/board-feel";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  RotateCcw,
  Send,
  Heart,
  Brain,
  Grid3X3,
  Pencil,
  Circle,
} from "lucide-react";
import dynamic from "next/dynamic";
import { Game, GameKind, registry, trivia, know } from "@/lib/games";
import { triviaV2, knowV2 } from "@/lib/extra-games";
import type { Stroke } from "./Doodle";
import { useGameMusic } from "./MusicControls";
const Doodle = dynamic(() => import("./Doodle"), {
  loading: () => <p>Opening the sketchbook…</p>,
});
export const gameIcons = {
  grid: Grid3X3,
  circles: Circle,
  pencil: Pencil,
  heart: Heart,
  brain: Brain,
};
export default function GameSurface({
  game,
  slot,
  names,
  move,
  newGame,
  back,
  word,
  strokes,
  onStroke,
  busy,
  hideBack = false,
  report,
  musicActive = true,
}: {
  game: Game;
  slot: number;
  names: string[];
  move: (action: Record<string, unknown>) => Promise<void>;
  newGame: (kind: GameKind) => Promise<void>;
  back: () => void;
  word: string | null;
  strokes: Stroke[];
  onStroke: (s: Stroke) => Promise<void>;
  busy: boolean;
  hideBack?: boolean;
  report?: (position: number) => Promise<void>;
  musicActive?: boolean;
}) {
  const [guess, setGuess] = useState(""),
    [self, setSelf] = useState(""),
    [prediction, setPrediction] = useState("");
  useEffect(() => {
    setSelf("");
    setPrediction("");
    setGuess("");
  }, [game.id, game.state.round, slot]);
  const s = game.state,
    definition = registry.find((g) => g.id === game.kind)!,
    finished = s.status !== "playing";
  const winning = s.board
    ? winningCells(
        s.board,
        game.kind === "tic" ? 3 : 7,
        game.kind === "tic" ? 3 : 4,
      )
    : new Set<number>();
  const submitted = s.submitted?.includes(slot);
  useGameMusic(game.kind, musicActive && !finished);
  const questions =
    game.kind === "know"
      ? s.pack === "general-v2"
        ? knowV2
        : know
      : s.pack === "gemini-v1"
        ? s.questions || []
        : s.pack === "general-v2"
          ? triviaV2
          : trivia;
  const q = questions[s.round];
  const banner =
    s.status === "cancelled"
      ? "Game cancelled. A player left the session."
      : finished
        ? s.winner === null
          ? "A draw. Call it a love-love."
          : `${names[s.winner]} wins this one.`
        : game.kind === "draw"
          ? `${names[s.artist!]} is drawing.`
          : game.kind === "know" || game.kind === "trivia"
            ? submitted
              ? "Your answer is tucked away. Waiting for your partner."
              : `Round ${s.round + 1} of ${s.count || 5}`
            : `${names[s.turn]}'s turn${s.turn === slot ? " — that’s you" : ""}`;
  return (
    <section className="game-paper" aria-label={definition.name}>
      {!hideBack && (
        <button className="text-button" onClick={back}>
          <ArrowLeft size={17} />
          Back to Play
        </button>
      )}
      <div className="game-heading">
        <h2>{definition.name}</h2>
      </div>
      <p className="turn" role="status" aria-live="polite">
        {banner}
      </p>
      {(game.kind === "tic" || game.kind === "connect") && (
        <div
          className={`board ${game.kind}`}
          role="group"
          aria-label={definition.name}
        >
          {game.kind === "connect" && (
            <div className="column-controls">
              {Array.from({ length: 7 }, (_, i) => (
                <button
                  key={i}
                  aria-label={`Drop piece into column ${i + 1}`}
                  disabled={
                    busy || finished || s.turn !== slot || s.board![i] !== 0
                  }
                  onClick={() => void move({ cell: i })}
                >
                  {i + 1}
                  <span>↓</span>
                </button>
              ))}
            </div>
          )}
          <div className="board-cells">
            {s.board!.map((value, i) =>
              game.kind === "tic" ? (
                <button
                  key={`${i}:${value}`}
                  className={`piece p${value} ${finished && value && s.winner !== null ? (winning.has(i) ? "winning-piece" : s.winner !== value - 1 ? "losing-piece" : "") : ""}`}
                  aria-label={`Row ${Math.floor(i / 3) + 1}, column ${(i % 3) + 1}: ${value === 0 ? "empty" : names[value - 1]}`}
                  disabled={busy || finished || s.turn !== slot || value !== 0}
                  onClick={() => void move({ cell: i })}
                >
                  {value === 1 ? "×" : value === 2 ? "○" : ""}
                </button>
              ) : (
                <span
                  key={`${i}:${value}`}
                  className={`piece p${value} ${winning.has(i) ? "winning-piece" : ""}`}
                  aria-label={`Row ${Math.floor(i / 7) + 1}, column ${(i % 7) + 1}: ${value === 0 ? "empty" : names[value - 1]}`}
                >
                  {value === 1 ? "×" : value === 2 ? "○" : ""}
                </span>
              ),
            )}
          </div>
        </div>
      )}
      {game.kind === "draw" && (
        <>
          <p className="handwriting">
            {s.status === "cancelled"
              ? "The drawing session was cancelled."
              : finished
                ? `The word was ${s.word}.`
                : slot === s.artist
                  ? `Your secret word: ${word || "opening…"}`
                  : "What do you see in the sketch?"}
          </p>
          <Doodle
            strokes={strokes}
            onStroke={onStroke}
            disabled={busy || finished || slot !== s.artist}
            busy={busy}
            mode={
              finished ? "finished" : slot === s.artist ? "drawing" : "viewing"
            }
          />
          {!finished && slot !== s.artist && (
            <form
              className="inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                void move({ guess })
                  .then(() => setGuess(""))
                  .catch(() => {});
              }}
            >
              <label className="sr-only" htmlFor="guess">
                Your guess
              </label>
              <input
                id="guess"
                value={guess}
                maxLength={60}
                onChange={(e) => setGuess(e.target.value)}
                placeholder="Is it a cat?"
                required
              />
              <button disabled={busy}>
                <Send size={18} />
                Guess
              </button>
            </form>
          )}
          <p className="small">
            {s.pack === "general-v2" &&
              (finished
                ? `${s.guesses?.length || 0} ${(s.guesses?.length || 0) === 1 ? "guess" : "guesses"} made · `
                : `${Math.max(0, 5 - (s.guesses?.length || 0))} guesses left · `)}
            Guesses: {s.guesses?.join(" · ") || "A fresh page. No guesses yet."}
          </p>
        </>
      )}
      {(game.kind === "know" || game.kind === "trivia") && !finished && q && (
        <div className="question-game">
          <h3>{q.q}</h3>
          {game.kind === "trivia" && report && (
            <button
              className="text-button small"
              disabled={busy}
              onClick={() => void report(s.round + 1).catch(() => {})}
            >
              Report a bad question
            </button>
          )}
          {game.kind === "know" && (
            <fieldset disabled={busy || submitted}>
              <legend>My own answer</legend>
              <div className="option-list">
                {q.options.map((o, i) => (
                  <label key={o}>
                    <input
                      type="radio"
                      name="self"
                      value={i}
                      checked={self === String(i)}
                      onChange={(e) => setSelf(e.target.value)}
                    />
                    {o}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <fieldset disabled={busy || submitted}>
            <legend>
              {game.kind === "know"
                ? `I think ${names[1 - slot]} would choose…`
                : "My answer"}
            </legend>
            <div className="option-list">
              {q.options.map((o, i) => (
                <label key={o}>
                  <input
                    type="radio"
                    name="prediction"
                    value={i}
                    checked={prediction === String(i)}
                    onChange={(e) => setPrediction(e.target.value)}
                  />
                  {o}
                </label>
              ))}
            </div>
          </fieldset>
          <button
            disabled={
              busy ||
              submitted ||
              prediction === "" ||
              (game.kind === "know" && self === "")
            }
            onClick={() =>
              void move(
                game.kind === "know"
                  ? { self, guess: prediction }
                  : { answer: prediction },
              ).catch(() => {})
            }
          >
            Seal my answer <Heart size={17} />
          </button>
        </div>
      )}
      {(game.kind === "trivia" || game.kind === "know") && (
        <>
          <p className="scoreline">
            {names[0]} {s.scores[0]} <span>to</span> {s.scores[1]} {names[1]}
          </p>
          {s.last && (
            <details className="last-round">
              <summary>Open the previous round’s answers</summary>
              {s.last.answers.map((a, i) => (
                <p key={i}>
                  {names[i]}:{" "}
                  {game.kind === "know"
                    ? `self: ${questions[Math.max(0, s.round - 1)].options[Number(a.self)]}; guess: ${questions[Math.max(0, s.round - 1)].options[Number(a.guess)]}`
                    : questions[Math.max(0, s.round - 1)].options[
                        Number(a.answer)
                      ]}
                </p>
              ))}
              {game.kind === "trivia" && (
                <p>
                  Correct:{" "}
                  {
                    questions[Math.max(0, s.round - 1)].options[
                      Number(s.last.correct)
                    ]
                  }
                </p>
              )}
              {s.last.funFact && <p>{s.last.funFact}</p>}
            </details>
          )}
        </>
      )}
      {finished && (
        <div className="win-note">
          <Heart size={28} />
          <p className="handwriting">Same team, even when we compete.</p>
          <button disabled={busy} onClick={() => void newGame(game.kind)}>
            <RotateCcw size={17} />
            Play another
          </button>
        </div>
      )}
    </section>
  );
}
