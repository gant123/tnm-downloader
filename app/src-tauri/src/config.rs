use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VpnMode {
    /// Route torrent traffic through NordVPN's SOCKS5 proxy servers using
    /// Nord service credentials. Fully in-app, no NordVPN client needed.
    Proxy,
    /// Watch a system VPN adapter (e.g. NordLynx) and kill-switch on drop.
    Adapter,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub download_dir: PathBuf,
    /// Refuse to start/resume transfers unless VPN protection is active.
    pub strict_vpn: bool,
    /// Resume transfers the kill switch paused once protection returns.
    pub auto_resume_on_reconnect: bool,
    /// Stop seeding the moment a download finishes.
    pub stop_on_complete: bool,
    /// 0 = unlimited, otherwise KiB/s.
    pub upload_limit_kib: u32,
    /// 0 = unlimited, otherwise KiB/s.
    pub download_limit_kib: u32,
    pub vpn_mode: VpnMode,
    /// NordVPN SOCKS5 endpoint, e.g. amsterdam.nl.socks.nordhold.net
    pub nord_socks_host: String,
    pub nord_socks_port: u16,
    /// Nord "service credentials" (dashboard → NordVPN → manual setup).
    pub nord_user: String,
    pub nord_pass: String,
    /// Adapter mode: substring matched case-insensitively against adapter names.
    pub vpn_adapter_name: String,
    /// Nord access token for the self-managed WireGuard tunnel (no NordVPN app).
    pub nord_token: String,
    /// Info-hashes the user chose to keep seeding after completion.
    pub keep_seeding: Vec<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            download_dir: PathBuf::new(),
            strict_vpn: true,
            auto_resume_on_reconnect: true,
            stop_on_complete: true,
            upload_limit_kib: 0,
            download_limit_kib: 0,
            vpn_mode: VpnMode::Proxy,
            nord_socks_host: "amsterdam.nl.socks.nordhold.net".to_string(),
            nord_socks_port: 1080,
            nord_user: String::new(),
            nord_pass: String::new(),
            vpn_adapter_name: "NordLynx".to_string(),
            nord_token: String::new(),
            keep_seeding: Vec::new(),
        }
    }
}

impl Settings {
    pub fn proxy_configured(&self) -> bool {
        !self.nord_socks_host.is_empty() && !self.nord_user.is_empty() && !self.nord_pass.is_empty()
    }

    /// socks5://user:pass@host:port with credentials percent-encoded.
    pub fn socks_url(&self) -> Option<String> {
        if self.vpn_mode != VpnMode::Proxy || !self.proxy_configured() {
            return None;
        }
        Some(format!(
            "socks5://{}:{}@{}:{}",
            pct(&self.nord_user),
            pct(&self.nord_pass),
            self.nord_socks_host,
            self.nord_socks_port
        ))
    }

    /// Settings that require rebuilding the torrent session to take effect.
    pub fn engine_config_changed(&self, other: &Settings) -> bool {
        self.vpn_mode != other.vpn_mode
            || self.nord_socks_host != other.nord_socks_host
            || self.nord_socks_port != other.nord_socks_port
            || self.nord_user != other.nord_user
            || self.nord_pass != other.nord_pass
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
