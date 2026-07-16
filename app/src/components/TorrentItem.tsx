import { ArrowDown, ArrowUp, Pause, Play, Trash2 } from "lucide-react";
import type { TorrentRow } from "../types";
import { displayState, formatBytes, formatSpeed, progressPct, stateLabel } from "../format";

interface Props {
  t: TorrentRow;
  selected: boolean;
  onSelect: () => void;
  onPause: () => void;
  onResume: () => void;
  onRemove: () => void;
}

export default function TorrentItem({ t, selected, onSelect, onPause, onResume, onRemove }: Props) {
  const s = t.stats;
  const state = displayState(s);
  const pct = progressPct(s);
  const live = s.live;
  const peers = live?.snapshot?.peer_stats?.live ?? 0;
  const eta = live?.time_remaining?.human_readable;
  const running = s.state === "live" || s.state === "initializing";

  return (
    <div className={`torrent ${selected ? "selected" : ""}`} onClick={onSelect}>
      <div className="torrent-top">
        <span className="torrent-name" title={t.name}>{t.name}</span>
        <span className="torrent-meta">
          {formatBytes(s.total_bytes)}
          {state === "downloading" && eta ? ` · ETA ${eta}` : ""}
        </span>
      </div>
      <div className="bar">
        <div
          className={`bar-fill ${state}`}
          style={{ width: `${state === "checking" ? 100 : pct}%` }}
        />
      </div>
      <div className="torrent-bottom">
        <span className={`chip ${state}`}>{stateLabel[state]}</span>
        {live && (
          <>
            <span className="stat down">
              <ArrowDown size={13} /> {formatSpeed(live.download_speed?.mbps)}
            </span>
            <span className="stat up">
              <ArrowUp size={13} /> {formatSpeed(live.upload_speed?.mbps)}
            </span>
            <span className="stat dim">{peers} peers</span>
          </>
        )}
        <span className="stat dim">{pct.toFixed(1)}%</span>
        {s.error && <span className="stat err" title={s.error}>{s.error}</span>}
        <span className="row-actions" onClick={(e) => e.stopPropagation()}>
          {running ? (
            <button className="icon-btn" title="Pause" onClick={onPause}>
              <Pause size={15} />
            </button>
          ) : (
            <button className="icon-btn" title="Resume" onClick={onResume}>
              <Play size={15} />
            </button>
          )}
          <button className="icon-btn danger" title="Remove" onClick={onRemove}>
            <Trash2 size={15} />
          </button>
        </span>
      </div>
    </div>
  );
}
