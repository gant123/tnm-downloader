import { useEffect, useState } from "react";
import { X } from "lucide-react";
import * as api from "../api";
import type { TorrentDetail, TorrentRow } from "../types";
import { formatBytes, progressPct } from "../format";

interface Props {
  torrent: TorrentRow;
  onClose: () => void;
  onError: (msg: string) => void;
}

type Tab = "general" | "files" | "peers" | "trackers";

export default function DetailPanel({ torrent, onClose, onError }: Props) {
  const [tab, setTab] = useState<Tab>("general");
  const [detail, setDetail] = useState<TorrentDetail | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setDirty(false);
    api
      .getTorrentDetail(torrent.id)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        setChecked(new Set(d.files.filter((f) => f.included).map((f) => f.index)));
      })
      .catch((e) => onError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [torrent.id]);

  const s = torrent.stats;
  const peerStats = s.live?.snapshot?.peer_stats;

  const toggleFile = (index: number) => {
    const next = new Set(checked);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setChecked(next);
    setDirty(true);
  };

  const applyFiles = async () => {
    try {
      await api.setTorrentFiles(torrent.id, Array.from(checked));
      setDirty(false);
    } catch (e) {
      onError(String(e));
    }
  };

  const toggleKeepSeeding = async () => {
    try {
      await api.setKeepSeeding(torrent.id, !torrent.keep_seeding);
    } catch (e) {
      onError(String(e));
    }
  };

  return (
    <div className="detail">
      <div className="detail-tabs">
        {(["general", "files", "peers", "trackers"] as Tab[]).map((t) => (
          <button
            key={t}
            className={`tab ${tab === t ? "active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
        <button className="icon-btn detail-close" onClick={onClose} title="Close panel">
          <X size={15} />
        </button>
      </div>

      <div className="detail-body">
        {tab === "general" && (
          <div className="kv-grid">
            <span className="k">Name</span>
            <span className="v">{torrent.name}</span>
            <span className="k">Info hash</span>
            <span className="v mono">{torrent.info_hash}</span>
            <span className="k">Size</span>
            <span className="v">
              {formatBytes(s.progress_bytes)} of {formatBytes(s.total_bytes)} ({progressPct(s).toFixed(1)}%)
            </span>
            <span className="k">Uploaded</span>
            <span className="v">{formatBytes(s.uploaded_bytes)}</span>
            <span className="k">Seeding</span>
            <span className="v">
              <label className="check">
                <input
                  type="checkbox"
                  checked={torrent.keep_seeding}
                  onChange={toggleKeepSeeding}
                />
                Keep seeding after download completes
              </label>
            </span>
          </div>
        )}

        {tab === "files" && (
          <div className="files">
            {!detail && <p className="dim-text">Loading files…</p>}
            {detail?.files.length === 0 && (
              <p className="dim-text">No file list yet — metadata is still resolving.</p>
            )}
            {detail?.files.map((f) => (
              <div className="file-row" key={f.index}>
                <label className="check file-check">
                  <input
                    type="checkbox"
                    checked={checked.has(f.index)}
                    onChange={() => toggleFile(f.index)}
                  />
                  <span className="file-path" title={f.path}>{f.path}</span>
                </label>
                <span className="file-size">
                  {formatBytes(s.file_progress[f.index] ?? f.progress)} / {formatBytes(f.len)}
                </span>
              </div>
            ))}
            {dirty && (
              <button className="btn primary apply-files" onClick={applyFiles}>
                Apply file selection
              </button>
            )}
          </div>
        )}

        {tab === "peers" && (
          <div className="kv-grid">
            <span className="k">Connected</span>
            <span className="v">{peerStats?.live ?? 0}</span>
            <span className="k">Connecting</span>
            <span className="v">{peerStats?.connecting ?? 0}</span>
            <span className="k">Queued</span>
            <span className="v">{peerStats?.queued ?? 0}</span>
            <span className="k">Seen total</span>
            <span className="v">{peerStats?.seen ?? 0}</span>
            <span className="k">Dead</span>
            <span className="v">{peerStats?.dead ?? 0}</span>
          </div>
        )}

        {tab === "trackers" && (
          <div className="files">
            {detail?.trackers.length === 0 && (
              <p className="dim-text">No trackers (DHT/PEX only).</p>
            )}
            {detail?.trackers.map((t) => (
              <div className="file-row" key={t}>
                <span className="file-path mono">{t}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
