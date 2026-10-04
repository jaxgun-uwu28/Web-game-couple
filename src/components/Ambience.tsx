"use client";
import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX, Moon, Sun, CloudRain } from "lucide-react";
export default function Ambience() {
  const [sound, setSound] = useState(false),
    [night, setNight] = useState(false),
    [weather, setWeather] = useState(""),
    [weatherBusy, setWeatherBusy] = useState(false);
  const audio = useRef<AudioContext | null>(null);
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
      void audio.current?.close();
    };
  }, []);
  const toggleAudio = async () => {
    if (sound) {
      await audio.current?.close();
      audio.current = null;
      setSound(false);
      return;
    }
    try {
      const ctx = new AudioContext();
      audio.current = ctx;
      const gain = ctx.createGain();
      gain.gain.value = 0.025;
      gain.connect(ctx.destination);
      for (const frequency of [174, 261, 348]) {
        const osc = ctx.createOscillator();
        osc.frequency.value = frequency;
        osc.connect(gain);
        osc.start();
      }
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 280;
      const noiseGain = ctx.createGain();
      noiseGain.gain.value = 0.012;
      noise.connect(filter).connect(noiseGain).connect(ctx.destination);
      noise.start();
      await ctx.resume();
      setSound(true);
    } catch {
      setWeather("Sound is unavailable in this browser.");
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
      <button
        className="icon-button"
        aria-label={sound ? "Turn ambient sound off" : "Turn ambient sound on"}
        aria-pressed={sound}
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
      {weather && (
        <span className="weather-status" role="status">
          {weather}
        </span>
      )}
    </div>
  );
}
