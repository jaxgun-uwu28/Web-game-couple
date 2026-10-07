"use client";
import { useEffect, useState, useRef } from "react";
import { diceLanding } from "@/lib/cards";
import { armGameSounds, playGameSound, gameHaptic } from "@/lib/game-feel";
import { Slot } from "./ArtSlots";
export default function GameDie({
  value,
  sides,
  rolled,
  onRoll,
}: {
  value: number | null;
  sides: 6 | 20;
  rolled: boolean;
  onRoll?: () => void;
}) {
  const [rolling, setRolling] = useState(false),
    [shakeEnabled, setShakeEnabled] = useState(false),
    [permission, setPermission] = useState(""),
    lastShake = useRef(0);
  useEffect(() => {
    if (!shakeEnabled || rolled || !onRoll) return;
    const handle = (e: DeviceMotionEvent) => {
      const a = e.acceleration;
      if (
        a &&
        Math.hypot(a.x || 0, a.y || 0, a.z || 0) > 15 &&
        Date.now() - lastShake.current > 2000
      ) {
        lastShake.current = Date.now();
        playGameSound("dice-shake");
        onRoll();
      }
    };
    window.addEventListener("devicemotion", handle);
    return () => window.removeEventListener("devicemotion", handle);
  }, [shakeEnabled, rolled, onRoll]);
  useEffect(() => {
    if (!rolled) return;
    setRolling(true);
    const t = setTimeout(() => {
      setRolling(false);
      playGameSound("dice-land");
      setTimeout(() => playGameSound("dice-land"), 100);
    }, 1400);
    return () => clearTimeout(t);
  }, [rolled, value]);
  const [x, y] = value && sides === 6 ? diceLanding(value).rotation : [0, 0];
  return (
    <div className="game-die-wrap">
      <button
        aria-label={rolled ? `Die ${value ?? "hidden"}` : "Shake and roll"}
        disabled={!onRoll || rolled}
        onClick={(e) => {
          armGameSounds();
          playGameSound("dice-shake");
          playGameSound("dice-roll");
          void gameHaptic(e.currentTarget, true);
          onRoll?.();
        }}
      >
        {value === null && (
          <span className="die-hidden" aria-hidden="true">
            ?
          </span>
        )}
        <Slot name={`ledger-dice-d${sides}`} className="die-art">
          <span />
        </Slot>
        <span
          className={`game-die ${sides === 6 ? "cube" : "d20"} ${rolling ? "rolling" : ""}`}
          style={{ transform: `rotateX(${x}deg) rotateY(${y}deg)` }}
        >
          {sides === 6 ? (
            [1, 2, 3, 4, 5, 6].map((n) => (
              <span key={n} className={`die-face face-${n}`}>
                <span className="die-pips">
                  {Array.from({ length: n }, (_, i) => (
                    <i key={i} />
                  ))}
                </span>
              </span>
            ))
          ) : (
            <span>{rolling ? "✦" : rolled ? value : "?"}</span>
          )}
        </span>
      </button>
      {rolled && !rolling && value === sides && <strong>Lucky!</strong>}
      {rolled && !rolling && sides === 20 && value === 1 && (
        <strong>Oops!</strong>
      )}
      {!rolled && onRoll && (
        <>
          <p>Shake and roll</p>
          <button
            className="text-button"
            onClick={async () => {
              armGameSounds();
              try {
                const permission = (
                  DeviceMotionEvent as unknown as {
                    requestPermission?: () => Promise<string>;
                  }
                ).requestPermission;
                if (permission && (await permission()) !== "granted") {
                  setPermission("Use the roll button instead.");
                  return;
                }
                setShakeEnabled((x) => !x);
              } catch {
                setPermission("Use the roll button instead.");
              }
            }}
          >
            {shakeEnabled ? "Disable phone shake" : "Enable phone shake"}
          </button>
          {permission && <p role="status">{permission}</p>}
        </>
      )}
    </div>
  );
}
