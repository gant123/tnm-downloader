import { useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import type { Update } from "@tauri-apps/plugin-updater";
import { ArrowDown, ArrowUp, Download, Globe, ShieldAlert, ShieldCheck, X } from "lucide-react";

import * as api from "./api";
import type { Filter, ProxyStatus, Settings, TorrentRow } from "./types";
import { formatSpeed } from "./format";
import { checkForUpdate, installUpdate } from "./updater";
import Header from "./components/Header";
import Sidebar, { matchesFilter } from "./components/Sidebar";
import TorrentItem from "./components/TorrentItem";
import DetailPanel from "./components/DetailPanel";
import { AddMagnetModal, RemoveModal, SettingsModal } from "./components/Modals";
import "./App.css";

export default function App() {
  const [torrents, setTorrents] = useState<TorrentRow[]>([]);
  const [status, setStatus] = useState<ProxyStatus | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showMagnet, setShowMagnet] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<TorrentRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [update, setUpdate] = useState<Update | null>(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);

  const showError = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 6000);
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const runUpdate = async () => {
    if (!update) return;
    setInstalling(true);
    // Gracefully pause active transfers before the installer kills us.
    // (librqbit persists session state, so they resume after relaunch.)
    for (const t of torrents) {
      if (t.stats.state === "live") {
        try {
          await api.pauseTorrent(t.id);
        } catch {
          /* best effort */
        }
      }
    }
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
    } else {
      showToast("You're on the latest version.");
    }
  };

  useEffect(() => {
    api.listTorrents().then(setTorrents).catch(() => {});
    api.getProxyStatus().then(setStatus).catch(() => {});
    api.getSettings().then(setSettings).catch(() => {});
    checkForUpdate().then((u) => u && setUpdate(u)).catch(() => {});

    const unTorrents = listen<TorrentRow[]>("torrents-update", (e) =>
      setTorrents(e.payload),
    );
    const unVpn = listen<ProxyStatus>("proxy-status", (e) => setStatus(e.payload));
    const unDrop = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === "drop") {
        for (const p of event.payload.paths) {
          if (p.toLowerCase().endsWith(".torrent")) {
            api.addTorrent(p).catch((err) => showError(String(err)));
          }
        }
      }
    });
    return () => {
      unTorrents.then((f) => f());
      unVpn.then((f) => f());
      unDrop.then((f) => f());
    };
  }, []);

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

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return torrents.filter(
      (t) =>
        matchesFilter(t, filter) &&
        (q === "" || t.name.toLowerCase().includes(q)),
    );
  }, [torrents, filter, search]);

  const selected = torrents.find((t) => t.id === selectedId) ?? null;

  const totals = useMemo(() => {
    let down = 0;
    let up = 0;
    for (const t of torrents) {
      down += t.stats.live?.download_speed?.mbps ?? 0;
      up += t.stats.live?.upload_speed?.mbps ?? 0;
    }
    return { down, up };
  }, [torrents]);

  return (
    <div className="app">
      {update && !updateDismissed && (
        <div className="update-banner">
          <Download size={15} />
          <span>
            Version {update.version} is available.
            {update.body ? ` ${update.body}` : ""}
          </span>
          <button className="btn primary small" onClick={runUpdate} disabled={installing}>
            {installing ? "Updating…" : "Restart & update"}
          </button>
          <button
            className="icon-btn"
            title="Dismiss"
            onClick={() => setUpdateDismissed(true)}
            disabled={installing}
          >
            <X size={14} />
          </button>
        </div>
      )}
      <Header
        status={status}
        search={search}
        onSearch={setSearch}
        onAddFile={addTorrentFile}
        onAddMagnet={() => setShowMagnet(true)}
        onOpenFolder={() => api.openDownloadFolder().catch((e) => showError(String(e)))}
        onOpenSettings={() => setShowSettings(true)}
      />

      <div className="main">
        <Sidebar torrents={torrents} filter={filter} onFilter={setFilter} />

        <div className="content">
          <div className="torrent-list">
            {visible.length === 0 && (
              <div className="empty">
                <p>No torrents here</p>
                <p className="dim-text">
                  Drop a .torrent file anywhere, paste a magnet link, or click Add torrent.
                </p>
              </div>
            )}
            {visible.map((t) => (
              <TorrentItem
                key={t.id}
                t={t}
                selected={t.id === selectedId}
                onSelect={() => setSelectedId(t.id === selectedId ? null : t.id)}
                onPause={() => api.pauseTorrent(t.id).catch((e) => showError(String(e)))}
                onResume={() => api.resumeTorrent(t.id).catch((e) => showError(String(e)))}
                onRemove={() => setRemoveTarget(t)}
              />
            ))}
          </div>

          {selected && (
            <DetailPanel
              torrent={selected}
              onClose={() => setSelectedId(null)}
              onError={showError}
            />
          )}
        </div>
      </div>

      <footer className="statusbar">
        <span className="stat down">
          <ArrowDown size={13} /> {formatSpeed(totals.down)}
        </span>
        <span className="stat up">
          <ArrowUp size={13} /> {formatSpeed(totals.up)}
        </span>
        <span className="stat dim">{torrents.length} torrents</span>
        <span
          className={`stat vpn-note ${
            !status?.proxy_enabled ? "neutral" : status?.ok ? "okc" : "badc"
          }`}
        >
          {!status?.proxy_enabled ? (
            <Globe size={13} />
          ) : status?.ok ? (
            <ShieldCheck size={13} />
          ) : (
            <ShieldAlert size={13} />
          )}
          {status?.detail ?? "Direct connection"}
        </span>
      </footer>

      {toast && (
        <div className="toast" onClick={() => setToast(null)}>
          {toast}
        </div>
      )}

      {showMagnet && (
        <AddMagnetModal onAdd={addMagnet} onClose={() => setShowMagnet(false)} />
      )}
      {removeTarget && (
        <RemoveModal
          name={removeTarget.name}
          onClose={() => setRemoveTarget(null)}
          onConfirm={(del) => {
            api
              .removeTorrent(removeTarget.id, del)
              .catch((e) => showError(String(e)));
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
