import { useState, useEffect } from "react";

type Platform = "twitch" | "kick";

const PLATFORMS: Record<Platform, { color: string; label: string; textColor: string; voidColor: string; gridOpacity: string }> = {
  twitch: { color: "#9146FF", label: "Twitch", textColor: "#ffffff", voidColor: "#393073", gridOpacity: "0.35" },
  kick:   { color: "#53FC18", label: "Kick",   textColor: "#0a1a00", voidColor: "#036617", gridOpacity: "0.18" },
};

const STORAGE_KEY = "preferred-platform";

export default function PlatformToggle() {
  const [platform, setPlatform] = useState<Platform>("twitch");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Platform | null;
    if (stored && stored in PLATFORMS) {
      setPlatform(stored);
      applyColor(stored);
    }
  }, []);

  function applyColor(p: Platform) {
    document.documentElement.style.setProperty("--color-primary", PLATFORMS[p].color);
    document.documentElement.style.setProperty("--color-primary-text", PLATFORMS[p].textColor);
    document.documentElement.style.setProperty("--color-bg-void", PLATFORMS[p].voidColor);
    document.documentElement.style.setProperty("--grid-opacity", PLATFORMS[p].gridOpacity);
    document.documentElement.setAttribute("data-platform", p);
  }

  function toggle() {
    const next: Platform = platform === "twitch" ? "kick" : "twitch";
    setPlatform(next);
    applyColor(next);
    localStorage.setItem(STORAGE_KEY, next);
  }

  const isTwitch = platform === "twitch";

  return (
    <button
      onClick={toggle}
      title={`Cambiar a ${isTwitch ? "Kick" : "Twitch"}`}
      aria-label={`Plataforma activa: ${PLATFORMS[platform].label}. Cambiar a ${isTwitch ? "Kick" : "Twitch"}`}
      className="flex items-center gap-2  px-3 py-1.5  border border-black/10 dark:border-white/10 bg-black/10 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors text-xs font-mono select-none rounded-xs"
    >
      <span
        className="w-3 h-3 transition-colors"
        style={{ backgroundColor: PLATFORMS[platform].color }}
        aria-hidden="true"
      />
      <span className="text-black dark:text-white">{PLATFORMS[platform].label}</span>
    </button>
  );
}
