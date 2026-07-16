import { FolderOpen, Link, Plus, Settings as SettingsIcon, ShieldCheck, ShieldOff } from "lucide-react";
import type { VpnStatus } from "../types";
import logo from "../assets/logo.png";

interface Props {
  vpn: VpnStatus | null;
  search: string;
  onSearch: (v: string) => void;
  onAddFile: () => void;
  onAddMagnet: () => void;
  onOpenFolder: () => void;
  onOpenSettings: () => void;
}

export default function Header(p: Props) {
  const vpnOk = p.vpn?.protected ?? false;
  const vpnLabel = vpnOk
    ? p.vpn?.mode === "proxy"
      ? "Nord proxy · Protected"
      : "VPN · Protected"
    : "Unprotected · Set up";
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
        className={`vpn-pill ${vpnOk ? "ok" : "bad"}`}
        onClick={() => !vpnOk && p.onOpenSettings()}
        title={p.vpn?.detail ?? ""}
      >
        {vpnOk ? <ShieldCheck size={15} /> : <ShieldOff size={15} />}
        {vpnLabel}
      </button>

      <button className="btn ghost" onClick={p.onOpenSettings} title="Settings">
        <SettingsIcon size={16} />
      </button>
    </header>
  );
}
