export interface Speed {
  mbps: number;
  human_readable?: string;
}

export interface PeerStats {
  queued: number;
  connecting: number;
  live: number;
  seen: number;
  dead: number;
  not_needed: number;
}

export interface LiveStats {
  snapshot: {
    peer_stats?: PeerStats;
    uploaded_bytes?: number;
    fetched_bytes?: number;
    [k: string]: unknown;
  };
  download_speed: Speed;
  upload_speed: Speed;
  time_remaining: { human_readable?: string } | null;
}

export type TorrentState = "initializing" | "live" | "paused" | "error";

export interface Stats {
  state: TorrentState;
  error: string | null;
  file_progress: number[];
  progress_bytes: number;
  uploaded_bytes: number;
  total_bytes: number;
  finished: boolean;
  live: LiveStats | null;
}

export interface TorrentRow {
  id: number;
  info_hash: string;
  name: string;
  keep_seeding: boolean;
  stats: Stats;
}

export interface FileRow {
  index: number;
  path: string;
  len: number;
  included: boolean;
  progress: number;
}

export interface TorrentDetail {
  id: number;
  info_hash: string;
  name: string;
  trackers: string[];
  files: FileRow[];
}

export type VpnMode = "proxy" | "adapter";

export interface Settings {
  download_dir: string;
  strict_vpn: boolean;
  auto_resume_on_reconnect: boolean;
  stop_on_complete: boolean;
  upload_limit_kib: number;
  download_limit_kib: number;
  vpn_mode: VpnMode;
  nord_socks_host: string;
  nord_socks_port: number;
  nord_user: string;
  nord_pass: string;
  vpn_adapter_name: string;
  keep_seeding: string[];
}

export interface VpnStatus {
  protected: boolean;
  mode: VpnMode;
  detail: string;
}

export type Filter =
  | "all"
  | "downloading"
  | "seeding"
  | "completed"
  | "paused"
  | "error";
