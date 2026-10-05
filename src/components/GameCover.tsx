import { Brain, Heart, Pencil, X, Circle } from "lucide-react";

/** Geometry from each game's play surface, rather than a small generic badge. */
export default function GameCover({ kind }: { kind: string }) {
  if (kind === "tic")
    return (
      <div className="cover-board cover-tic" aria-hidden="true">
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i}>
            {[0, 4, 8].includes(i) ? (
              <X />
            ) : [2, 6].includes(i) ? (
              <Circle />
            ) : null}
          </div>
        ))}
      </div>
    );
  if (kind === "connect")
    return (
      <div className="cover-board cover-connect" aria-hidden="true">
        {Array.from({ length: 28 }, (_, i) => (
          <i
            key={i}
            className={
              i >= 21 || [15, 16, 19].includes(i)
                ? i % 2
                  ? "filled"
                  : "partner"
                : ""
            }
          />
        ))}
      </div>
    );
  if (kind === "block")
    return (
      <div className="cover-blocks" aria-hidden="true">
        {[0, 1, 2].map((n) => (
          <div className={`cover-piece piece-${n}`} key={n}>
            {Array.from({ length: n === 0 ? 4 : n === 1 ? 5 : 3 }, (_, i) => (
              <i key={i} />
            ))}
          </div>
        ))}
      </div>
    );
  if (kind === "draw")
    return (
      <div className="cover-drawing" aria-hidden="true">
        <svg viewBox="0 0 180 110" fill="none">
          <path
            d="M20 76C30 16 64 26 52 60S88 90 97 47s42-24 37 10"
            stroke="currentColor"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path
            d="M23 94h110"
            stroke="currentColor"
            strokeWidth="2"
            opacity=".25"
          />
        </svg>
        <Pencil />
      </div>
    );
  if (kind === "know")
    return (
      <div className="cover-hearts" aria-hidden="true">
        <Heart />
        <Heart />
      </div>
    );
  return (
    <div className="cover-brain" aria-hidden="true">
      <i />
      <Brain />
      <i />
    </div>
  );
}
