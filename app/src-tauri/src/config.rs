use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// How torrent traffic is routed. Default is Direct — the app works on plain
/// internet with nothing blocked. A proxy is entirely optional.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProxyType {
    None,
    Socks5,
}

impl Default for ProxyType {
    fn default() -> Self {
        ProxyType::None
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub download_dir: PathBuf,
    /// Stop seeding the moment a download finishes.
    pub stop_on_complete: bool,
    /// 0 = unlimited, otherwise KiB/s.
    pub upload_limit_kib: u32,
    /// 0 = unlimited, otherwise KiB/s.
    pub download_limit_kib: u32,

    // ---- Proxy (optional, Tixati-style). Default None = plain internet. ----
    pub proxy_type: ProxyType,
    pub proxy_host: String,
    pub proxy_port: u16,
    pub proxy_user: String,
    pub proxy_pass: String,
    /// Opt-in: pause all torrents if the proxy can't be reached. This only ever
    /// pauses TORRENTS — it never touches the rest of your PC's internet.
    pub proxy_kill_switch: bool,
    /// Resume torrents the kill switch paused once the proxy is reachable again.
    pub auto_resume_on_reconnect: bool,

    /// UI accent color: "green" | "blue" | "violet" | "amber".
    pub accent: String,

    // ---- Automation ----
    /// Folder polled for new .torrent files to auto-add (empty = off).
    pub watch_folder: String,
    /// RSS feeds polled for new torrents to auto-add.
    pub rss_feeds: Vec<RssFeed>,

    /// Info-hashes the user chose to keep seeding after completion.
    pub keep_seeding: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct RssFeed {
    pub url: String,
    /// Case-insensitive substring an item title must contain (empty = all).
    pub filter: String,
    pub enabled: bool,
}

impl Default for RssFeed {
    fn default() -> Self {
        Self {
            url: String::new(),
            filter: String::new(),
            enabled: true,
        }
    }
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            download_dir: PathBuf::new(),
            stop_on_complete: true,
            upload_limit_kib: 0,
            download_limit_kib: 0,
            proxy_type: ProxyType::None,
            proxy_host: String::new(),
            proxy_port: 1080,
            proxy_user: String::new(),
            proxy_pass: String::new(),
            proxy_kill_switch: false,
            auto_resume_on_reconnect: true,
            accent: "green".to_string(),
            watch_folder: String::new(),
            rss_feeds: Vec::new(),
            keep_seeding: Vec::new(),
        }
    }
}

impl Settings {
    /// A proxy is configured and should be used.
    pub fn proxy_enabled(&self) -> bool {
        self.proxy_type != ProxyType::None && !self.proxy_host.trim().is_empty()
    }

    /// socks5://[user:pass@]host:port with credentials percent-encoded, or None
    /// when running direct.
    pub fn socks_url(&self) -> Option<String> {
        if self.proxy_type != ProxyType::Socks5 || self.proxy_host.trim().is_empty() {
            return None;
        }
        let host = self.proxy_host.trim();
        if self.proxy_user.is_empty() {
            Some(format!("socks5://{host}:{}", self.proxy_port))
        } else {
            Some(format!(
                "socks5://{}:{}@{host}:{}",
                pct(&self.proxy_user),
                pct(&self.proxy_pass),
                self.proxy_port
            ))
        }
    }

    /// Settings that require rebuilding the torrent session to take effect.
    pub fn engine_config_changed(&self, other: &Settings) -> bool {
        self.proxy_type != other.proxy_type
            || self.proxy_host != other.proxy_host
            || self.proxy_port != other.proxy_port
            || self.proxy_user != other.proxy_user
            || self.proxy_pass != other.proxy_pass
            || self.download_dir != other.download_dir
    }

    pub fn load(path: &Path) -> Self {
        std::fs::read_to_string(path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, path: &Path) -> anyhow::Result<()> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(path, serde_json::to_string_pretty(self)?)?;
        Ok(())
    }
}

fn pct(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}
