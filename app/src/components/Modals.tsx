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

        <h4>NordVPN protection</h4>
        <div className="form-row">
          <label>Protection mode</label>
          <select
            value={form.vpn_mode}
            onChange={(e) => set("vpn_mode", e.target.value as Settings["vpn_mode"])}
          >
            <option value="proxy">Nord SOCKS5 proxy (built in — no NordVPN app needed)</option>
            <option value="adapter">Watch a system VPN adapter (kill switch)</option>
          </select>
        </div>

        {form.vpn_mode === "proxy" && (
          <>
            <p className="dim-text">
              Uses your Nord service credentials (Nord Account dashboard → NordVPN →
              Manual setup). Only TNM's traffic goes through Nord — nothing else on
              your PC is touched. DHT is disabled in this mode so nothing can leak
              around the proxy.
            </p>
            <div className="form-row two">
              <div>
                <label>Nord SOCKS5 server</label>
                <input
                  list="nord-hosts"
                  value={form.nord_socks_host}
                  onChange={(e) => set("nord_socks_host", e.target.value)}
                />
                <datalist id="nord-hosts">
                  <option value="amsterdam.nl.socks.nordhold.net" />
                  <option value="nl.socks.nordhold.net" />
                  <option value="se.socks.nordhold.net" />
                  <option value="stockholm.se.socks.nordhold.net" />
                  <option value="us.socks.nordhold.net" />
                  <option value="atlanta.us.socks.nordhold.net" />
                  <option value="dallas.us.socks.nordhold.net" />
                  <option value="los-angeles.us.socks.nordhold.net" />
                </datalist>
              </div>
              <div>
                <label>Port</label>
                <input
                  type="number"
                  min={1}
                  max={65535}
                  value={form.nord_socks_port}
                  onChange={(e) => set("nord_socks_port", Number(e.target.value) || 1080)}
                />
              </div>
            </div>
            <div className="form-row two">
              <div>
                <label>Service username</label>
                <input
                  autoComplete="off"
                  value={form.nord_user}
                  onChange={(e) => set("nord_user", e.target.value)}
                />
              </div>
              <div>
                <label>Service password</label>
                <input
                  type="password"
                  autoComplete="off"
                  value={form.nord_pass}
                  onChange={(e) => set("nord_pass", e.target.value)}
                />
              </div>
            </div>
          </>
        )}

        {form.vpn_mode === "adapter" && (
          <div className="form-row">
            <label>VPN adapter name match (e.g. NordLynx)</label>
            <input
              value={form.vpn_adapter_name}
              onChange={(e) => set("vpn_adapter_name", e.target.value)}
            />
          </div>
        )}

        <label className="check">
          <input
            type="checkbox"
            checked={form.strict_vpn}
            onChange={(e) => set("strict_vpn", e.target.checked)}
          />
          Strict mode — pause everything and block transfers whenever protection is not active
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={form.auto_resume_on_reconnect}
            onChange={(e) => set("auto_resume_on_reconnect", e.target.checked)}
          />
          Auto-resume paused transfers when protection comes back
        </label>

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
