import { create } from "zustand";

interface PlayerStore {
  // State
  currentTime: number;
  duration: number;
  playing: boolean;
  muted: boolean;
  volume: number;
  playbackRate: number;
  frameRate: number;

  // Actions
  setCurrentTime: (t: number) => void;
  setDuration: (d: number) => void;
  setPlaying: (p: boolean) => void;
  togglePlay: () => void;
  setMuted: (m: boolean) => void;
  toggleMute: () => void;
  setVolume: (v: number) => void;
  setPlaybackRate: (r: number) => void;
  setFrameRate: (fps: number) => void;

  // Derived helpers
  currentFrame: () => number;
  totalFrames: () => number;
  timecode: () => string;
  progress: () => number;
}

export function frameToTimecode(frame: number, fps: number): string {
  const totalSeconds = frame / fps;
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const f = Math.floor(frame % fps);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}:${f.toString().padStart(2, "0")}`;
}

export function timecodeToFrame(tc: string, fps: number): number {
  const parts = tc.split(":").map(Number);
  if (parts.length !== 4) return 0;
  const [h, m, s, f] = parts;
  return Math.round((h * 3600 + m * 60 + s) * fps + f);
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatTimeLong(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export const usePlayerStore = create<PlayerStore>((set, get) => ({
  currentTime: 0,
  duration: 0,
  playing: false,
  muted: false,
  volume: 1,
  playbackRate: 1,
  frameRate: 30,

  setCurrentTime: (t) => set({ currentTime: t }),
  setDuration: (d) => set({ duration: d }),
  setPlaying: (p) => set({ playing: p }),
  togglePlay: () => set((s) => ({ playing: !s.playing })),
  setMuted: (m) => set({ muted: m }),
  toggleMute: () => set((s) => ({ muted: !s.muted })),
  setVolume: (v) => set({ volume: v, muted: v === 0 }),
  setPlaybackRate: (r) => set({ playbackRate: r }),
  setFrameRate: (fps) => set({ frameRate: fps }),

  currentFrame: () => Math.floor(get().currentTime * get().frameRate),
  totalFrames: () => Math.floor(get().duration * get().frameRate),
  timecode: () => frameToTimecode(get().currentFrame(), get().frameRate),
  progress: () => (get().duration > 0 ? get().currentTime / get().duration : 0),
}));
