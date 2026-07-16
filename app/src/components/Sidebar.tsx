import type { Filter, TorrentRow } from "../types";
import { displayState } from "../format";

interface Props {
  torrents: TorrentRow[];
  filter: Filter;
  onFilter: (f: Filter) => void;
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "downloading", label: "Downloading" },
  { key: "seeding", label: "Seeding" },
  { key: "completed", label: "Completed" },
  { key: "paused", label: "Paused" },
  { key: "error", label: "Error" },
];

export function matchesFilter(t: TorrentRow, f: Filter): boolean {
  if (f === "all") return true;
  const s = displayState(t.stats);
  if (f === "completed") return t.stats.finished;
  if (f === "seeding") return s === "seeding";
  if (f === "downloading") return s === "downloading" || s === "checking";
  return s === f;
}

export default function Sidebar({ torrents, filter, onFilter }: Props) {
  const count = (f: Filter) => torrents.filter((t) => matchesFilter(t, f)).length;
  return (
    <aside className="sidebar">
      {FILTERS.map((f) => (
        <button
          key={f.key}
          className={`side-item ${filter === f.key ? "active" : ""}`}
          onClick={() => onFilter(f.key)}
        >
          <span>{f.label}</span>
          <span className="side-count">{count(f.key)}</span>
        </button>
      ))}
    </aside>
  );
}
