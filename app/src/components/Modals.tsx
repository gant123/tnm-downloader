import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { getVersion } from "@tauri-apps/api/app";
import type { Settings } from "../types";

export function AddMagnetModal({
  onAdd,
  onFile,
  onClose,
}: {
  onAdd: (src: string) => void;
  onFile?: () => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");
  const submit = () => {
    const v = value.trim();
    if (v) onAdd(v);
  };
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Add torrent</h3>
        <textarea
          autoFocus
          rows={4}
          placeholder="Paste a magnet link:  magnet:?xt=urn:btih:…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="modal-actions">
          {onFile && (
            <button className="btn ghost" onClick={onFile} style={{ marginRight: "auto" }}>
              Choose .torrent file…
            </button>
          )}
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={submit} disabled={!value.trim()}>
            Add download
          </button>
        </div>
      </div>
    </div>
  );
}

export function RemoveModal({
  name,
  onConfirm,
  onClose,
}: {
  name: string;
  onConfirm: (deleteFiles: boolean) => void;
  onClose: () => void;
}) {
  const [deleteFiles, setDeleteFiles] = useState(false);
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Remove torrent</h3>
        <p className="dim-text">Remove “{name}” from the list?</p>
        <label className="check">
          <input
            type="checkbox"
            checked={deleteFiles}
            onChange={(e) => setDeleteFiles(e.target.checked)}
          />
          Also delete downloaded files from disk
        </label>
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn danger" onClick={() => onConfirm(deleteFiles)}>
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}

export function SettingsModal({
  settings,
  onSave,
  onClose,
  onCheckUpdates,
}: {
  settings: Settings;
  onSave: (s: Settings) => void;
  onClose: () => void;
  onCheckUpdates: () => Promise<void>;
}) {
  const [form, setForm] = useState<Settings>({ ...settings });
  const [version, setVersion] = useState("");
  const [checking, setChecking] = useState(false);
  useEffect(() => setForm({ ...settings }), [settings]);
  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
  }, []);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const pickFolder = async () => {
    const dir = await open({ directory: true });
    if (typeof dir === "string") set("download_dir", dir);
  };
  const pickWatchFolder = async () => {
    const dir = await open({ directory: true });
    if (typeof dir === "string") set("watch_folder", dir);
  };

  const setFeed = (i: number, patch: Partial<Settings["rss_feeds"][number]>) =>
    setForm((f) => ({
      ...f,
      rss_feeds: f.rss_feeds.map((x, j) => (j === i ? { ...x, ...patch } : x)),
    }));
  const addFeed = () =>
    setForm((f) => ({ ...f, rss_feeds: [...f.rss_feeds, { url: "", filter: "", enabled: true }] }));
  const removeFeed = (i: number) =>
    setForm((f) => ({ ...f, rss_feeds: f.rss_feeds.filter((_, j) => j !== i) }));

  const check = async () => {
    setChecking(true);
    try {
      await onCheckUpdates();
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h3>Settings</h3>

        <h4>Downloads</h4>
        <div className="form-row">
          <label>Download folder</label>
          <div className="joined">
            <input
              value={form.download_dir}
              onChange={(e) => set("download_dir", e.target.value)}
            />
            <button className="btn" onClick={pickFolder}>Browse</button>
          </div>
        </div>
        <div className="form-row two">
          <div>
            <label>Download limit (KiB/s, 0 = unlimited)</label>
            <input
              type="number"
              min={0}
              value={form.download_limit_kib}
              onChange={(e) => set("download_limit_kib", Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
          <div>
            <label>Upload limit (KiB/s, 0 = unlimited)</label>
            <input
              type="number"
              min={0}
              value={form.upload_limit_kib}
              onChange={(e) => set("upload_limit_kib", Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={form.stop_on_complete}
            onChange={(e) => set("stop_on_complete", e.target.checked)}
          />
          Stop seeding when a download completes
        </label>

        <h4>Proxy (optional)</h4>
        <p className="dim-text">
          TNM runs on your normal internet by default — nothing is required.
          Optionally route torrent traffic through a SOCKS5 proxy (e.g. a VPN's
          SOCKS server). This affects only TNM, never the rest of your PC.
        </p>
        <div className="form-row">
          <label>Proxy</label>
          <select
            value={form.proxy_type}
            onChange={(e) => set("proxy_type", e.target.value as Settings["proxy_type"])}
          >
            <option value="none">None — direct connection</option>
            <option value="socks5">SOCKS5</option>
          </select>
        </div>

        {form.proxy_type === "socks5" && (
          <>
            <div className="form-row two">
              <div>
                <label>Host</label>
                <input
                  autoComplete="off"
                  placeholder="us.socks.nordhold.net"
                  value={form.proxy_host}
                  onChange={(e) => set("proxy_host", e.target.value)}
                />
              </div>
              <div>
                <label>Port</label>
                <input
                  type="number"
                  min={1}
                  max={65535}
                  value={form.proxy_port}
                  onChange={(e) => set("proxy_port", Number(e.target.value) || 1080)}
                />
              </div>
            </div>
            <div className="form-row two">
              <div>
                <label>Username (optional)</label>
                <input
                  autoComplete="off"
                  value={form.proxy_user}
                  onChange={(e) => set("proxy_user", e.target.value)}
                />
              </div>
              <div>
                <label>Password (optional)</label>
                <input
                  type="password"
                  autoComplete="off"
                  value={form.proxy_pass}
                  onChange={(e) => set("proxy_pass", e.target.value)}
                />
              </div>
            </div>
            <p className="dim-text">
              In proxy mode DHT and UDP trackers are turned off so nothing leaks
              around the proxy — which can make rare, poorly-seeded torrents
              harder to finish. For Nord, use your service credentials and a host
              like <code>us.socks.nordhold.net</code>.
            </p>
            <label className="check">
              <input
                type="checkbox"
                checked={form.proxy_kill_switch}
                onChange={(e) => set("proxy_kill_switch", e.target.checked)}
              />
              Kill switch — pause torrents if the proxy drops (never touches the rest of your internet)
            </label>
            {form.proxy_kill_switch && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={form.auto_resume_on_reconnect}
                  onChange={(e) => set("auto_resume_on_reconnect", e.target.checked)}
                />
                Auto-resume when the proxy is back
              </label>
            )}
          </>
        )}

        <h4>Appearance</h4>
        <div className="form-row">
          <label>Accent color</label>
          <div style={{ display: "flex", gap: 10 }}>
            {(
              [
                ["green", "#4fd18a"],
                ["blue", "#5aa2f5"],
                ["violet", "#b48ef5"],
                ["amber", "#f5b74f"],
              ] as const
            ).map(([name, color]) => (
              <div
                key={name}
                onClick={() => set("accent", name)}
                title={name}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  background: color,
                  cursor: "pointer",
                  boxShadow:
                    form.accent === name ? `0 0 0 2px #14161a, 0 0 0 4px ${color}` : "none",
                }}
              />
            ))}
          </div>
        </div>

        <h4>Automation</h4>
        <div className="form-row">
          <label>Watch folder — auto-add any .torrent dropped here</label>
          <div className="joined">
            <input
              placeholder="(off)"
              value={form.watch_folder}
              onChange={(e) => set("watch_folder", e.target.value)}
            />
            <button className="btn" onClick={pickWatchFolder}>Browse</button>
          </div>
        </div>
        <div className="form-row">
          <label>RSS feeds — auto-download new torrents matching a title filter</label>
          {form.rss_feeds.length === 0 && (
            <p className="dim-text">No feeds yet. Add a feed URL and an optional title filter.</p>
          )}
          {form.rss_feeds.map((f, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
              <div className="joined">
                <input
                  placeholder="https://…/rss"
                  value={f.url}
                  onChange={(e) => setFeed(i, { url: e.target.value })}
                />
                <button className="btn danger" onClick={() => removeFeed(i)} title="Remove feed">
                  ✕
                </button>
              </div>
              <div className="joined">
                <input
                  placeholder="Title contains… (blank = all)"
                  value={f.filter}
                  onChange={(e) => setFeed(i, { filter: e.target.value })}
                />
                <label className="check" style={{ whiteSpace: "nowrap" }}>
                  <input
                    type="checkbox"
                    checked={f.enabled}
                    onChange={(e) => setFeed(i, { enabled: e.target.checked })}
                  />
                  On
                </label>
              </div>
            </div>
          ))}
          <button className="btn" onClick={addFeed} style={{ alignSelf: "flex-start" }}>
            + Add feed
          </button>
        </div>

        <h4>About</h4>
        <div className="form-row">
          <div className="about-row">
            <span className="dim-text">TNM Downloader v{version || "…"}</span>
            <button className="btn" onClick={check} disabled={checking}>
              {checking ? "Checking…" : "Check for updates"}
            </button>
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={() => onSave(form)}>Save settings</button>
        </div>
      </div>
    </div>
  );
}
