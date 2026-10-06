"use client";
import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX, Moon, Sun, CloudRain } from "lucide-react";
import { useAsset } from "./ArtSlots";
import { gameTracks, readAudio } from "@/lib/music";
export default function Ambience() {
  const ambient = useAsset("ambient");
  const [sound, setSound] = useState(false),
    [soundLoading, setSoundLoading] = useState(false),
    [soundError, setSoundError] = useState(""),
    [night, setNight] = useState(false),
    [weather, setWeather] = useState(""),
    [weatherBusy, setWeatherBusy] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const gameAudio = useRef<HTMLAudioElement | null>(null), backgroundWanted = useRef(false), currentGame = useRef<{kind: string; owner: string} | null>(null);
  useEffect(() => {
    const sync = () => {
      const p = readAudio(), bg = audio.current, game = gameAudio.current;
      if (!bg || !game) return;
      bg.volume = p.background; game.volume = p.games;
      const track = currentGame.current && gameTracks[currentGame.current.kind];
      if (track && p.gameMusic) {
        bg.pause();
        if (game.getAttribute("src") !== track) game.src = track;
        void game.play().catch(() => { setSoundError("Tap the music button to start the game track."); if (backgroundWanted.current) void bg.play().catch(() => {}); });
      } else {
        game.pause();
        if (backgroundWanted.current) void bg.play().catch(() => {});
      }
    };
    const changeGame = (event: Event) => {
      const d = (event as CustomEvent).detail;
      if (d.kind) currentGame.current = d;
      else if (currentGame.current?.owner === d.owner) currentGame.current = null;
      sync();
    };
    window.addEventListener("arcade-game-music", changeGame);
    window.addEventListener("arcade-audio-change", sync);
    return () => { gameAudio.current?.pause(); window.removeEventListener("arcade-game-music", changeGame); window.removeEventListener("arcade-audio-change", sync); };
  }, []);
  useEffect(() => {
    const hour = new Date().getHours();
    const theme =
      hour < 6 || hour >= 20
        ? "night"
        : hour < 11
          ? "morning"
          : hour < 17
            ? "golden"
            : "dusk";
    document.documentElement.dataset.time = theme;
    setNight(theme === "night");
    return () => {
      audio.current?.pause();
    };
  }, []);
  const toggleAudio = async () => {
    const player = audio.current;
    if (!player || soundLoading) return;
    setSoundError("");
    if (sound) {
      backgroundWanted.current = false;
      player.pause();
      setSound(false);
      return;
    }
    setSoundLoading(true);
    try {
      backgroundWanted.current = true;
      player.volume = readAudio().background;
      if (currentGame.current && readAudio().gameMusic) {
        const track = gameTracks[currentGame.current.kind];
        if (track && gameAudio.current) { gameAudio.current.src = track; gameAudio.current.volume = readAudio().games; await gameAudio.current.play(); }
        else await player.play();
      } else await player.play();
      setSound(true);
    } catch {
      setSound(false);
      setSoundError("Music could not play. Tap the sound button to try again.");
    } finally {
      setSoundLoading(false);
    }
  };
  const checkWeather = () => {
    setWeatherBusy(true);
    if (!navigator.geolocation) {
      setWeather("Weather unavailable. The cabin is still cozy.");
      setWeatherBusy(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const response = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${latitude.toFixed(2)}&longitude=${longitude.toFixed(2)}&current=weather_code,temperature_2m`,
            { signal: AbortSignal.timeout(8000) },
          );
          if (!response.ok) throw new Error();
          const data = await response.json();
          const rain =
            data.current.weather_code >= 51 && data.current.weather_code <= 99;
          document.documentElement.dataset.weather = rain ? "rain" : "clear";
          setWeather(
            `${Math.round(data.current.temperature_2m)}° outside · ${rain ? "rain at our window" : "a quiet sky"}`,
          );
        } catch {
          setWeather("The weather took a little break. Try again later.");
        } finally {
          setWeatherBusy(false);
        }
      },
      () => {
        setWeather("Location is optional. Enjoy our quiet forest.");
        setWeatherBusy(false);
      },
      { timeout: 8000, maximumAge: 300000 },
    );
  };
  return (
    <div className="ambience">
      <audio
        ref={audio}
        src={ambient?.kind === "audio" ? ambient.src : "/audio/music/web-app-background-music.mp3"}
        loop
        preload="none"
        onError={() => {
          setSound(false);
          setSoundError(
            "Music could not load. Tap the sound button to try again.",
          );
        }}
      />
      <audio ref={gameAudio} loop preload="none" onError={() => setSoundError("Game music could not load. Try again.")} />
      <button
        className="icon-button"
        aria-label={
          sound ? "Turn background music off" : "Turn background music on"
        }
        aria-pressed={sound}
        aria-busy={soundLoading}
        disabled={soundLoading}
        title="Background music"
        onClick={() => void toggleAudio()}
      >
        {sound ? <Volume2 size={19} /> : <VolumeX size={19} />}
      </button>
      <button
        className="icon-button"
        aria-label={night ? "Use daytime palette" : "Use night palette"}
        aria-pressed={night}
        onClick={() => {
          document.documentElement.dataset.time = night ? "morning" : "night";
          setNight(!night);
        }}
      >
        {night ? <Sun size={19} /> : <Moon size={19} />}
      </button>
      <button
        className="icon-button"
        aria-label="Use my location for optional weather"
        disabled={weatherBusy}
        onClick={checkWeather}
      >
        <CloudRain size={19} />
      </button>
      {(soundError || weather) && (
        <span className="weather-status" role="status">
          {soundError || weather}
        </span>
      )}
    </div>
  );
}
