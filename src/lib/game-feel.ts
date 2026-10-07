import { readAudio, tactile } from "./music";
export const soundSlots = [
  "card-flip",
  "card-deal",
  "card-slide",
  "dice-shake",
  "dice-roll",
  "dice-land",
  "chip-click",
  "chip-stack",
  "coin-win",
  "win-fanfare",
  "lose-sad",
  "wax-seal",
  "button-tap",
  "turn-ping",
  "tick",
] as const;
export type GameSound = (typeof soundSlots)[number];
let context: AudioContext | null = null,
  armed = false;
const assets = new Map<GameSound, string>();
export function armGameSounds() {
  armed = true;
}
export function setGameSoundAsset(slot: GameSound, src: string | null) {
  if (src) assets.set(slot, src);
  else assets.delete(slot);
}
export function playGameSound(slot: GameSound) {
  if (!armed || !readAudio().sounds) return;
  const pitch = 0.95 + Math.random() * 0.1,
    volume = readAudio().games;
  const fallback = () => {
    try {
      context ??= new AudioContext();
      void context.resume();
      const index = soundSlots.indexOf(slot),
        notes =
          slot === "win-fanfare"
            ? [523, 659, 784]
            : slot === "lose-sad"
              ? [330, 294, 220]
              : [180 + index * 28];
      for (const [i, f] of notes.entries()) {
        const o = context.createOscillator(),
          g = context.createGain(),
          t = context.currentTime + i * 0.08;
        o.type = slot.startsWith("dice") ? "triangle" : "sine";
        o.frequency.value = f * pitch;
        g.gain.setValueAtTime(0.09 * volume, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
        o.connect(g).connect(context.destination);
        o.start(t);
        o.stop(t + 0.18);
      }
    } catch {}
  };
  const src = assets.get(slot);
  if (src) {
    const audio = new Audio(src);
    audio.volume = volume;
    audio.playbackRate = pitch;
    void audio.play().catch(fallback);
  } else fallback();
}
export function reducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
export function tween(
  element: HTMLElement,
  frames: Keyframe[],
  duration = 500,
) {
  return element.animate(
    reducedMotion() ? [{ opacity: 0.75 }, { opacity: 1 }] : frames,
    {
      duration: reducedMotion() ? 120 : duration,
      easing: "cubic-bezier(.2,.8,.2,1)",
      fill: "none",
    },
  );
}
export function spring(element: HTMLElement) {
  return tween(
    element,
    [
      { transform: "scale(.85)" },
      { transform: "scale(1.07)" },
      { transform: "scale(1)" },
    ],
    420,
  );
}
export function shake(element: HTMLElement) {
  return tween(
    element,
    [
      { transform: "translateX(0)" },
      { transform: "translateX(-5px)" },
      { transform: "translateX(5px)" },
      { transform: "translateX(0)" },
    ],
    330,
  );
}
export function burst(
  element: HTMLElement,
  kind: "confetti" | "sparkle" | "coin" = "sparkle",
  target?: HTMLElement,
) {
  if (reducedMotion()) {
    tween(element, [{ opacity: 0.65 }, { opacity: 1 }], 150);
    return;
  }
  const bounds = element.getBoundingClientRect(),
    to = target?.getBoundingClientRect();
  for (let i = 0; i < 18; i++) {
    const bit = document.createElement("span");
    bit.className = `game-particle game-particle-${kind}`;
    bit.textContent = kind === "coin" ? "●" : kind === "sparkle" ? "✦" : "♥";
    bit.style.cssText = `position:fixed;pointer-events:none;z-index:10000;left:${bounds.left + bounds.width / 2}px;top:${bounds.top + bounds.height / 2}px;color:${["#F8C9D8", "#F7E6A6", "#EAE1F5"][i % 3]}`;
    document.body.append(bit);
    const x = to ? to.left - bounds.left : (Math.random() - 0.5) * 240,
      y = to ? to.top - bounds.top : -40 - Math.random() * 160;
    const a = bit.animate(
      [
        { transform: "translate(0,0) scale(.5)", opacity: 1 },
        {
          transform: `translate(${x}px,${y}px) rotate(${i * 35}deg)`,
          opacity: 0,
        },
      ],
      { duration: 700 + i * 15, easing: "ease-out" },
    );
    a.onfinish = () => bit.remove();
  }
}
export const confettiBurst = (e: HTMLElement) => burst(e, "confetti");
export const sparkleBurst = (e: HTMLElement) => burst(e, "sparkle");
export const coinFly = (e: HTMLElement, target: HTMLElement) =>
  burst(e, "coin", target);
export async function gameHaptic(element?: HTMLElement, strong = false) {
  await tactile(strong ? [20, 40, 20] : 12);
  if (element) spring(element);
}
