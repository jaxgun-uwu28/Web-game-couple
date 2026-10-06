import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { gameTracks, readAudio } from "../src/lib/music";
test("all named game tracks resolve to supplied files", () => {
  for (const track of Object.values(gameTracks))
    assert.ok(existsSync(`public${decodeURIComponent(track)}`), track);
  assert.ok(existsSync("public/audio/music/web-app-background-music.mp3"));
});
test("audio preferences default off, sanitize volume and recover from corrupt storage", () => {
  const before = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  try {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: { getItem: () => '{"background":9,"games":-2,"gameMusic":true}' },
    });
    assert.equal(readAudio().background, 1);
    assert.equal(readAudio().games, 0);
    assert.equal(readAudio().gameMusic, true);
    assert.equal(readAudio().sounds, false);
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: { getItem: () => "corrupt" },
    });
    assert.equal(readAudio().background, 0.3);
  } finally {
    if (before) Object.defineProperty(globalThis, "localStorage", before);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  }
});
