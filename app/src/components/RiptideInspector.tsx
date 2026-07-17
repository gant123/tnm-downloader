import { Pause, Play, Trash2 } from "lucide-react";
import type { TorrentDetail, TorrentRow } from "../types";
import { formatBytes, formatSpeed, displayState, stateLabel } from "../format";
import { badgeFor, categoryFor, spark } from "../riptide";

interface Props {
  torrent: TorrentRow;
  detail: TorrentDetail | null;
  acc: string;
  up: string;
  histDown: number[];
  histUp: number[];
  onPause: () => void;
  onResume: () => void;
  onRemove: () => void;
  onToggleKeepSeeding: () => void;
}

export default function RiptideInspector(p: Props) {
  const t = p.torrent;
  const s = t.stats;
  const ds = displayState(s);
  const running = s.state === "live" || s.state === "initializing";
  const badge = badgeFor(t.name);
  const acc = p.acc;
  const up = p.up;
  const STATUS_COLOR: Record<string, string> = {
    downloading: acc,
    seeding: "#5aa2f5",
    completed: "#4fd18a",
    paused: "#f5b74f",
    checking: "#6b7178",
    error: "#f5866b",
  };

  const dd = p.histDown.slice(-48);
  const uu = p.histUp.slice(-48);
  const mx = Math.max(...dd, ...uu, 0.001);
  const da = spark(dd, 316, 104, mx);
  const ua = spark(uu, 316, 104, mx);

  const peers = s.live?.snapshot?.peer_stats;
  const ratio = s.progress_bytes > 0 ? s.uploaded_bytes / s.progress_bytes : 0;
  const eta = s.live?.time_remaining?.human_readable;

  const stats: { k: string; v: string; color?: string }[] = [
    { k: "Downloaded", v: `${formatBytes(s.progress_bytes)} / ${formatBytes(s.total_bytes)}` },
    { k: "Uploaded", v: formatBytes(s.uploaded_bytes) },
    { k: "Share ratio", v: ratio.toFixed(2), color: ratio >= 1 ? "#4fd18a" : undefined },
    { k: "Peers", v: String(peers?.live ?? 0) },
    { k: "Seen", v: String(peers?.seen ?? 0) },
    { k: "Connecting", v: String(peers?.connecting ?? 0) },
    { k: "ETA", v: ds === "downloading" ? eta ?? "—" : ds === "seeding" ? "∞" : "—" },
    { k: "Status", v: stateLabel[ds] },
  ];

  return (
    <div className="rt-insp">
      <div className="rt-insp-head">
        <div className="rt-badge lg" style={{ background: badge.bg, color: badge.color }}>
          {badge.badge}
        </div>
        <div className="rt-insp-head-txt">
          <div className="rt-insp-name" title={t.name}>{t.name}</div>
          <div className="rt-insp-sub">
            <span className="rt-dot" style={{ background: STATUS_COLOR[ds] }} />
            <span>{stateLabel[ds]}</span>
            <span className="rt-mid">·</span>
            <span>{categoryFor(badge.badge)}</span>
          </div>
        </div>
      </div>

      <div className="rt-insp-section">
        <div className="rt-insp-graph-head">
          <span className="rt-label">TRANSFER RATE</span>
          <div className="rt-insp-graph-legend">
            <span style={{ color: acc }}>↓ {formatSpeed(s.live?.download_speed?.mbps)}</span>
            <span style={{ color: up }}>↑ {formatSpeed(s.live?.upload_speed?.mbps)}</span>
          </div>
        </div>
        <svg viewBox="0 0 316 108" preserveAspectRatio="none" className="rt-graph">
          <line x1="0" y1="27" x2="316" y2="27" className="rt-grid" />
          <line x1="0" y1="54" x2="316" y2="54" className="rt-grid" />
          <line x1="0" y1="81" x2="316" y2="81" className="rt-grid" />
          <path d={ua.area} fill={`${up}22`} />
          <path d={ua.line} fill="none" stroke={up} strokeWidth={1.6} />
          <path d={da.area} fill={`${acc}26`} />
          <path d={da.line} fill="none" stroke={acc} strokeWidth={1.8} />
        </svg>
      </div>

      <div className="rt-insp-stats">
        {stats.map((st) => (
          <div key={st.k}>
            <div className="rt-stat-k">{st.k}</div>
            <div className="rt-stat-v" style={st.color ? { color: st.color } : undefined}>
              {st.v}
            </div>
          </div>
        ))}
      </div>

      <div className="rt-insp-files">
        <div className="rt-label" style={{ marginBottom: 10 }}>
          FILES ({p.detail?.files.length ?? 0})
        </div>
        {!p.detail && <div className="rt-dim">Loading files…</div>}
        <div className="rt-file-list">
          {p.detail?.files.map((f) => {
            const pct = f.len > 0 ? Math.min(100, Math.round((f.progress / f.len) * 100)) : 0;
            const done = pct >= 100;
            const barColor = !f.included ? "#565c65" : done ? "#4fd18a" : acc;
            return (
              <div className="rt-file" key={f.index}>
                <div className="rt-file-main">
                  <div className="rt-file-name" title={f.path}>{f.path}</div>
                  <div className="rt-file-bar">
                    <div style={{ width: `${pct}%`, background: barColor }} />
                  </div>
                </div>
                <div className="rt-file-side">
                  <div className="rt-file-size">{formatBytes(f.len)}</div>
                  <div
                    className="rt-file-prio"
                    style={{ color: f.included ? "#7d838c" : "#565c65" }}
                  >
                    {f.included ? (done ? "Done" : "Included") : "Skip"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rt-insp-actions">
        <div className="rt-act-row">
          {running ? (
            <div className="rt-btn-primary" onClick={p.onPause}>
              <Pause size={15} /> Pause
            </div>
          ) : (
            <div className="rt-btn-primary" onClick={p.onResume}>
              <Play size={15} /> Resume
            </div>
          )}
          <div className="rt-btn-icon" title="Resume" onClick={p.onResume}>
            <Play size={15} />
          </div>
          <div className="rt-btn-icon danger" title="Remove" onClick={p.onRemove}>
            <Trash2 size={15} />
          </div>
        </div>
        <div className="rt-toggle-row" onClick={p.onToggleKeepSeeding}>
          <span>Keep seeding after complete</span>
          <div className={`rt-toggle ${t.keep_seeding ? "on" : ""}`}>
            <div className="rt-toggle-knob" />
          </div>
        </div>
      </div>
    </div>
  );
}
