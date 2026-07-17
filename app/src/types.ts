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

export type ProxyType = "none" | "socks5";

export interface Settings {
  download_dir: string;
  stop_on_complete: boolean;
  upload_limit_kib: number;
  download_limit_kib: number;
  proxy_type: ProxyType;
  proxy_host: string;
  proxy_port: number;
  proxy_user: string;
  proxy_pass: string;
  proxy_kill_switch: boolean;
  auto_resume_on_reconnect: boolean;
  accent: string;
  watch_folder: string;
  rss_feeds: RssFeed[];
  keep_seeding: string[];
}

export interface RssFeed {
  url: string;
  filter: string;
  enabled: boolean;
}

export interface ProxyStatus {
  proxy_enabled: boolean;
  ok: boolean;
  detail: string;
}

export type Filter =
  | "all"
  | "downloading"
  | "seeding"
  | "completed"
  | "paused"
  | "error";
