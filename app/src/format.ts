import type { Stats, TorrentState } from "./types";

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let v = n;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v >= 100 || u === 0 ? Math.round(v) : v.toFixed(1)} ${units[u]}`;
}

export function formatSpeed(mbps: number | undefined): string {
  if (mbps === undefined || !Number.isFinite(mbps)) return "0 B/s";
  return `${formatBytes(mbps * 1024 * 1024)}/s`;
}

export function progressPct(stats: Stats): number {
  if (!stats.total_bytes) return 0;
  return Math.min(100, (stats.progress_bytes / stats.total_bytes) * 100);
}

export type DisplayState =
  | "downloading"
  | "seeding"
  | "completed"
  | "paused"
  | "error"
  | "checking";

export function displayState(stats: Stats): DisplayState {
  const s: TorrentState = stats.state;
  if (s === "error") return "error";
  if (s === "initializing") return "checking";
  if (s === "paused") return stats.finished ? "completed" : "paused";
  return stats.finished ? "seeding" : "downloading";
}

export const stateLabel: Record<DisplayState, string> = {
  downloading: "Downloading",
  seeding: "Seeding",
  completed: "Completed",
  paused: "Paused",
  error: "Error",
  checking: "Checking",
};
