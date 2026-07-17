import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { getVersion } from "@tauri-apps/api/app";
import type { Settings } from "../types";

export function AddMagnetModal({
  onAdd,
  onClose,
}: {
  onAdd: (src: string) => void;
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
        <h3>Add magnet link</h3>
        <textarea
          autoFocus
          rows={4}
          placeholder="magnet:?xt=urn:btih:…"
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
