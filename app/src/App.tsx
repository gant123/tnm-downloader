import { useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import type { Update } from "@tauri-apps/plugin-updater";
import { Download, Plus, Search, Settings as SettingsIcon, X } from "lucide-react";

import * as api from "./api";
import type { Filter, ProxyStatus, Settings, TorrentDetail, TorrentRow } from "./types";
import { formatBytes, formatSpeed, progressPct, displayState, stateLabel } from "./format";
import { badgeFor, categoryFor, categoryColor, spark, pushHist } from "./riptide";
import { checkForUpdate, installUpdate } from "./updater";
import RiptideSidebar, { type NavItem, type TagItem } from "./components/RiptideSidebar";
import RiptideInspector from "./components/RiptideInspector";
import { AddMagnetModal, RemoveModal, SettingsModal } from "./components/Modals";
import logo from "./assets/logo.png";
import "./App.css";

const ACC = "#4fd18a";
const UP = "#5aa2f5";
const STATUS_COLOR: Record<string, string> = {
  downloading: ACC,
  seeding: "#5aa2f5",
  completed: "#4fd18a",
  paused: "#f5b74f",
  checking: "#6b7178",
  error: "#f5866b",
};

interface Hist {
  gDown: number[];
  gUp: number[];
  perId: Map<number, { down: number[]; up: number[] }>;
}

export default function App() {
  const [torrents, setTorrents] = useState<TorrentRow[]>([]);
  const [status, setStatus] = useState<ProxyStatus | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [filter, setFilter] = useState<Filter | string>("all");
  const [category, setCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<TorrentDetail | null>(null);
  const [showMagnet, setShowMagnet] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<TorrentRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [update, setUpdate] = useState<Update | null>(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);
  const hist = useRef<Hist>({ gDown: [], gUp: [], perId: new Map() });

  const showError = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 6000);
  };
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const ingest = (rows: TorrentRow[]) => {
    let gd = 0;
    let gu = 0;
    const h = hist.current;
    for (const t of rows) {
      const d = t.stats.live?.download_speed?.mbps ?? 0;
      const u = t.stats.live?.upload_speed?.mbps ?? 0;
      gd += d;
      gu += u;
      const cur = h.perId.get(t.id) ?? { down: [], up: [] };
      h.perId.set(t.id, { down: pushHist(cur.down, d), up: pushHist(cur.up, u) });
    }
    h.gDown = pushHist(h.gDown, gd);
    h.gUp = pushHist(h.gUp, gu);
    setTorrents(rows);
  };

  useEffect(() => {
    api.listTorrents().then(ingest).catch(() => {});
    api.getProxyStatus().then(setStatus).catch(() => {});
    api.getSettings().then(setSettings).catch(() => {});
    checkForUpdate().then((u) => u && setUpdate(u)).catch(() => {});

    const unT = listen<TorrentRow[]>("torrents-update", (e) => ingest(e.payload));
    const unS = listen<ProxyStatus>("proxy-status", (e) => setStatus(e.payload));
    const unD = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === "drop") {
        for (const p of event.payload.paths) {
          if (p.toLowerCase().endsWith(".torrent")) {
            api.addTorrent(p).catch((err) => showError(String(err)));
          }
        }
      }
    });
    return () => {
      unT.then((f) => f());
      unS.then((f) => f());
      unD.then((f) => f());
    };
  }, []);

  // Keep the inspector's file list fresh for the selected torrent.
  useEffect(() => {
    if (selectedId == null) {
      setDetail(null);
      return;
    }
    let alive = true;
    const load = () =>
      api
        .getTorrentDetail(selectedId)
        .then((d) => alive && setDetail(d))
        .catch(() => {});
    load();
    const iv = setInterval(load, 2000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [selectedId]);

  const addTorrentFile = async () => {
    const picked = await open({
      multiple: true,
      filters: [{ name: "Torrent", extensions: ["torrent"] }],
    });
    const paths = Array.isArray(picked) ? picked : picked ? [picked] : [];
    for (const p of paths) {
      try {
        await api.addTorrent(p);
      } catch (e) {
        showError(String(e));
      }
    }
  };
  const addMagnet = async (src: string) => {
    setShowMagnet(false);
    try {
      await api.addTorrent(src);
    } catch (e) {
      showError(String(e));
    }
  };

  const runUpdate = async () => {
    if (!update) return;
    setInstalling(true);
    for (const t of torrents)
      if (t.stats.state === "live") await api.pauseTorrent(t.id).catch(() => {});
    try {
      await installUpdate(update);
    } catch (e) {
      setInstalling(false);
      showError(`Update failed: ${e}`);
    }
  };
  const manualCheck = async () => {
    const u = await checkForUpdate();
    if (u) {
      setUpdate(u);
      setUpdateDismissed(false);
      setShowSettings(false);
    } else showToast("You're on the latest version.");
  };

  // ---- derived data ----
  const withMeta = useMemo(
    () =>
      torrents.map((t) => {
        const b = badgeFor(t.name);
        return { t, badge: b, category: categoryFor(b.badge), ds: displayState(t.stats) };
      }),
    [torrents],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: torrents.length };
    for (const { ds } of withMeta) c[ds] = (c[ds] ?? 0) + 1;
    return c;
  }, [withMeta, torrents.length]);

  const nav: NavItem[] = [
    { key: "all", label: "All Torrents", dot: "#6b7178", count: counts.all ?? 0 },
    { key: "downloading", label: "Downloading", dot: ACC, count: counts.downloading ?? 0 },
    { key: "seeding", label: "Seeding", dot: "#5aa2f5", count: counts.seeding ?? 0 },
    { key: "completed", label: "Completed", dot: "#4fd18a", count: counts.completed ?? 0 },
    {
      key: "paused",
      label: "Paused",
      dot: "#f5b74f",
      count: (counts.paused ?? 0) + (counts.checking ?? 0),
    },
  ].map((n) => ({ ...n, active: filter === n.key }));

  const tags: TagItem[] = useMemo(() => {
    const byCat = new Map<string, number>();
    for (const { category: c } of withMeta) byCat.set(c, (byCat.get(c) ?? 0) + 1);
    return [...byCat.entries()].map(([label, count]) => ({
      label,
      color: categoryColor[label] ?? "#8b919a",
      count,
      active: category === label,
    }));
  }, [withMeta, category]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return withMeta.filter(({ t, category: c, ds }) => {
      if (filter === "paused" ? !(ds === "paused" || ds === "checking") : filter !== "all" && ds !== filter)
        return false;
      if (category && c !== category) return false;
      if (q && !t.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [withMeta, filter, category, search]);

  const totals = useMemo(() => {
    let down = 0;
    let up = 0;
    let uploaded = 0;
    let downloaded = 0;
    for (const t of torrents) {
      down += t.stats.live?.download_speed?.mbps ?? 0;
      up += t.stats.live?.upload_speed?.mbps ?? 0;
      uploaded += t.stats.uploaded_bytes;
      downloaded += t.stats.progress_bytes;
    }
    return { down, up, ratio: downloaded > 0 ? uploaded / downloaded : 0 };
  }, [torrents]);

  const selected = torrents.find((t) => t.id === selectedId) ?? null;
  const gd = spark(hist.current.gDown, 180, 28);
  const gu = spark(hist.current.gUp, 180, 28);
  const titleMap: Record<string, string> = {
    all: "All Torrents",
    downloading: "Downloading",
    seeding: "Seeding",
    completed: "Completed",
    paused: "Paused",
  };
  const viewTitle = category ? category : titleMap[filter] ?? "Torrents";

  return (
    <div className="rt-app">
      {update && !updateDismissed && (
        <div className="rt-update">
          <Download size={14} />
          <span>Version {update.version} is available.{update.body ? ` ${update.body}` : ""}</span>
          <button className="rt-update-btn" onClick={runUpdate} disabled={installing}>
            {installing ? "Updating…" : "Restart & update"}
          </button>
          <button className="rt-update-x" onClick={() => setUpdateDismissed(true)} disabled={installing}>
            <X size={13} />
          </button>
        </div>
      )}

      {/* Title strip */}
      <div className="rt-title">
        <img className="rt-logo" src={logo} alt="" />
        <span className="rt-title-name">TNM Downloader</span>
        <span className="rt-title-sub">Torrent Client</span>
        <div className="rt-flex" />
        <div className="rt-title-stat">
          <span style={{ color: ACC }}>↓</span>
          <span>{formatSpeed(totals.down)}</span>
        </div>
        <div className="rt-title-stat">
          <span style={{ color: UP }}>↑</span>
          <span>{formatSpeed(totals.up)}</span>
        </div>
      </div>

      <div className="rt-body">
        <RiptideSidebar
          nav={nav}
          tags={tags}
          status={status}
          onNav={(k) => {
            setFilter(k);
            setCategory(null);
          }}
          onTag={(l) => {
            setCategory((c) => (c === l ? null : l));
            setFilter("all");
          }}
        />

        <div className="rt-main">
          {/* Toolbar */}
          <div className="rt-toolbar">
            <div className="rt-toolbar-txt">
              <div className="rt-view-title">{viewTitle}</div>
              <div className="rt-view-sub">
                {visible.length} torrent{visible.length === 1 ? "" : "s"}
                {search ? ` matching “${search}”` : ""}
              </div>
            </div>
            <div className="rt-flex" />
            <div className="rt-searchbox">
              <Search size={14} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search torrents…"
              />
            </div>
            <div className="rt-add" onClick={() => setShowMagnet(true)}>
              <Plus size={16} /> Add Torrent
            </div>
            <div className="rt-icon-btn" title="Settings" onClick={() => setShowSettings(true)}>
              <SettingsIcon size={16} />
            </div>
          </div>

          {/* Stats strip */}
          <div className="rt-stats">
            <div className="rt-stat-card">
              <div className="rt-stat-label">Download</div>
              <div className="rt-stat-big" style={{ color: ACC }}>{formatSpeed(totals.down)}</div>
              <svg viewBox="0 0 180 30" preserveAspectRatio="none" className="rt-mini">
                <path d={gd.area} fill={`${ACC}26`} />
                <path d={gd.line} fill="none" stroke={ACC} strokeWidth={1.6} />
              </svg>
            </div>
            <div className="rt-stat-card">
              <div className="rt-stat-label">Upload</div>
              <div className="rt-stat-big" style={{ color: UP }}>{formatSpeed(totals.up)}</div>
              <svg viewBox="0 0 180 30" preserveAspectRatio="none" className="rt-mini">
                <path d={gu.area} fill={`${UP}22`} />
                <path d={gu.line} fill="none" stroke={UP} strokeWidth={1.6} />
              </svg>
            </div>
            <div className="rt-stat-card center">
              <div className="rt-stat-label">Active</div>
              <div className="rt-stat-huge">{counts.downloading ?? 0}</div>
              <div className="rt-stat-label">of {torrents.length} torrents</div>
            </div>
            <div className="rt-stat-card center">
              <div className="rt-stat-label">Share ratio</div>
              <div className="rt-stat-huge">{totals.ratio.toFixed(2)}</div>
              <div className="rt-stat-label">all-time</div>
            </div>
          </div>

          {/* List header */}
          <div className="rt-list-head">
            <div />
            <div>NAME</div>
            <div>PROGRESS</div>
            <div>STATUS</div>
            <div>SPEED</div>
            <div>PEERS</div>
          </div>

          {/* Rows */}
          <div className="rt-list">
            {visible.length === 0 && (
              <div className="rt-empty">
                <p>No torrents here</p>
                <p className="rt-dim">Drop a .torrent file, paste a magnet, or click Add Torrent.</p>
              </div>
            )}
            {visible.map(({ t, badge, category: cat, ds }) => {
              const st = t.stats;
              const sel = t.id === selectedId;
              const pct = progressPct(st);
              const barColor = STATUS_COLOR[ds];
              const peers = st.live?.snapshot?.peer_stats;
              const eta =
                ds === "downloading"
                  ? st.live?.time_remaining?.human_readable ?? "—"
                  : ds === "seeding"
                    ? "∞"
                    : ds === "completed"
                      ? "done"
                      : ds === "paused"
                        ? "paused"
                        : "—";
              const dmbps = st.live?.download_speed?.mbps ?? 0;
              const umbps = st.live?.upload_speed?.mbps ?? 0;
              return (
                <div
                  key={t.id}
                  className="rt-row"
                  style={{
                    borderLeftColor: sel ? ACC : "transparent",
                    background: sel ? "rgba(255,255,255,.055)" : "transparent",
                  }}
                  onClick={() => setSelectedId(t.id === selectedId ? null : t.id)}
                >
                  <div className="rt-badge" style={{ background: badge.bg, color: badge.color }}>
                    {badge.badge}
                  </div>
                  <div className="rt-row-name-wrap">
                    <div className="rt-row-name" style={{ color: sel ? "#fff" : "#e8eaed" }} title={t.name}>
                      {t.name}
                    </div>
                    <div className="rt-row-meta">
                      {formatBytes(st.total_bytes)}&nbsp;&nbsp;·&nbsp;&nbsp;{cat}
                    </div>
                  </div>
                  <div>
                    <div className="rt-bar">
                      <div style={{ width: `${pct}%`, background: barColor }} />
                    </div>
                    <div className="rt-bar-meta">
                      <span>{pct.toFixed(pct >= 100 ? 0 : 1)}%</span>
                      <span>{eta}</span>
                    </div>
                  </div>
                  <div className="rt-status">
                    <span className="rt-dot" style={{ background: STATUS_COLOR[ds] }} />
                    <span>{stateLabel[ds]}</span>
                  </div>
                  <div className="rt-speed">
                    <div style={{ color: dmbps > 0.0001 ? ACC : "#565c65" }}>↓ {formatSpeed(dmbps)}</div>
                    <div style={{ color: umbps > 0.0001 ? UP : "#565c65" }}>↑ {formatSpeed(umbps)}</div>
                  </div>
                  <div className="rt-peers">
                    <div>{peers?.live ?? 0} peers</div>
                    <div className="rt-dim">{peers?.seen ?? 0} seen</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Inspector */}
        {selected ? (
          <RiptideInspector
            torrent={selected}
            detail={detail}
            histDown={hist.current.perId.get(selected.id)?.down ?? []}
            histUp={hist.current.perId.get(selected.id)?.up ?? []}
            onPause={() => api.pauseTorrent(selected.id).catch((e) => showError(String(e)))}
            onResume={() => api.resumeTorrent(selected.id).catch((e) => showError(String(e)))}
            onRemove={() => setRemoveTarget(selected)}
            onToggleKeepSeeding={() =>
              api
                .setKeepSeeding(selected.id, !selected.keep_seeding)
                .catch((e) => showError(String(e)))
            }
          />
        ) : (
          <div className="rt-insp empty">
            <p className="rt-dim">Select a torrent to inspect its files, peers, and transfer rate.</p>
          </div>
        )}
      </div>

      {toast && (
        <div className="rt-toast" onClick={() => setToast(null)}>
          {toast}
        </div>
      )}
      {showMagnet && (
        <AddMagnetModal
          onAdd={addMagnet}
          onFile={() => {
            setShowMagnet(false);
            addTorrentFile();
          }}
          onClose={() => setShowMagnet(false)}
        />
      )}
      {removeTarget && (
        <RemoveModal
          name={removeTarget.name}
          onClose={() => setRemoveTarget(null)}
          onConfirm={(del) => {
            api.removeTorrent(removeTarget.id, del).catch((e) => showError(String(e)));
            if (selectedId === removeTarget.id) setSelectedId(null);
            setRemoveTarget(null);
          }}
        />
      )}
      {showSettings && settings && (
        <SettingsModal
          settings={settings}
          onCheckUpdates={manualCheck}
          onClose={() => setShowSettings(false)}
          onSave={(s) => {
            api
              .saveSettings(s)
              .then(() => {
                setSettings(s);
                setShowSettings(false);
              })
              .catch((e) => showError(String(e)));
          }}
        />
      )}
    </div>
  );
}
