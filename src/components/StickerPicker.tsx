"use client";
import { armGameSounds, playGameSound } from "@/lib/game-feel";
export default function StickerPicker<T extends string | number | boolean>({
  label,
  value,
  options,
  onChange,
  format = (x) => String(x),
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  format?: (value: T) => string;
}) {
  return (
    <fieldset className="sticker-picker">
      <legend>{label}</legend>
      <div role="group" aria-label={label}>
        {options.map((x) => (
          <button
            type="button"
            key={String(x)}
            aria-pressed={value === x}
            className={value === x ? "selected" : ""}
            onClick={() => {
              armGameSounds();
              playGameSound("button-tap");
              onChange(x);
            }}
          >
            <span aria-hidden="true">
              {String(x) === "d6" ? (
                <svg width="24" height="24" viewBox="0 0 24 24">
                  <rect
                    x="2"
                    y="2"
                    width="20"
                    height="20"
                    rx="5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  {[
                    [7, 7],
                    [17, 7],
                    [12, 12],
                    [7, 17],
                    [17, 17],
                  ].map(([cx, cy]) => (
                    <circle
                      key={cx + ":" + cy}
                      cx={cx}
                      cy={cy}
                      r="1.6"
                      fill="currentColor"
                    />
                  ))}
                </svg>
              ) : String(x) === "d20" ? (
                <svg width="24" height="24" viewBox="0 0 24 24">
                  <path
                    d="M6 2h12l5 10-5 10H6L1 12Z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <text
                    x="12"
                    y="15"
                    textAnchor="middle"
                    fontSize="9"
                    fill="currentColor"
                  >
                    20
                  </text>
                </svg>
              ) : String(x) === "card" ? (
                "♠"
              ) : value === x ? (
                "♥"
              ) : (
                "◇"
              )}
            </span>
            {format(x)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
