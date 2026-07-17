import {
  FolderOpen,
  Globe,
  Link,
  Plus,
  Settings as SettingsIcon,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import type { ProxyStatus } from "../types";
import logo from "../assets/logo.png";

interface Props {
  status: ProxyStatus | null;
  search: string;
  onSearch: (v: string) => void;
  onAddFile: () => void;
  onAddMagnet: () => void;
  onOpenFolder: () => void;
  onOpenSettings: () => void;
}

export default function Header(p: Props) {
  const s = p.status;
  const direct = !s?.proxy_enabled;
  const cls = direct ? "neutral" : s?.ok ? "ok" : "bad";
  const label = direct
    ? "Direct"
    : s?.ok
      ? "Proxy on"
      : "Proxy down";
  return (
    <header className="header">
      <div className="brand">
        <img className="brand-logo" src={logo} alt="TNM shield logo" />
        <div className="brand-text">
          <span className="brand-name">TNM Downloader</span>
          <span className="brand-tag">Three names. One powerful downloader.</span>
        </div>
      </div>

      <button className="btn" onClick={p.onAddFile} title="Add .torrent file">
        <Plus size={15} /> Add torrent
      </button>
      <button className="btn" onClick={p.onAddMagnet} title="Add magnet link">
        <Link size={15} /> Magnet
      </button>
      <button className="btn ghost" onClick={p.onOpenFolder} title="Open download folder">
        <FolderOpen size={15} />
      </button>

      <input
        className="search"
        placeholder="Filter torrents"
        value={p.search}
        onChange={(e) => p.onSearch(e.target.value)}
      />

      <button
        className={`vpn-pill ${cls}`}
        onClick={p.onOpenSettings}
        title={s?.detail ?? "Direct connection (no proxy)"}
      >
        {direct ? (
          <Globe size={15} />
        ) : s?.ok ? (
          <ShieldCheck size={15} />
        ) : (
          <ShieldAlert size={15} />
        )}
        {label}
      </button>

      <button className="btn ghost" onClick={p.onOpenSettings} title="Settings">
        <SettingsIcon size={16} />
      </button>
    </header>
  );
}
