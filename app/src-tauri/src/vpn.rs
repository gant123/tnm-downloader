use serde::Serialize;

use crate::config::{Settings, VpnMode};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct VpnStatus {
    pub protected: bool,
    /// "proxy" or "adapter"
    pub mode: String,
    /// Human-readable description of what protects the traffic (or why nothing does).
    pub detail: String,
}

/// Compute the protection status for the current settings.
///
/// Proxy mode: the engine only dials peers/trackers through Nord's SOCKS5
/// server, so traffic cannot leak — "protected" simply means credentials are
/// configured (the session was built with the proxy).
///
/// Adapter mode: look for a network adapter whose name contains the
/// configured substring (case-insensitive), e.g. NordLynx, which only exists
/// while the tunnel is up.
pub fn check(settings: &Settings) -> VpnStatus {
    match settings.vpn_mode {
        VpnMode::Proxy => {
            if settings.proxy_configured() {
                VpnStatus {
                    protected: true,
                    mode: "proxy".into(),
                    detail: format!(
                        "NordVPN SOCKS5 · {}:{}",
                        settings.nord_socks_host, settings.nord_socks_port
                    ),
                }
            } else {
                VpnStatus {
                    protected: false,
                    mode: "proxy".into(),
                    detail: "Nord service credentials not set — open settings".into(),
                }
            }
        }
        VpnMode::Adapter => {
            let needle = settings.vpn_adapter_name.to_lowercase();
            if let Ok(ifaces) = if_addrs::get_if_addrs() {
                for iface in ifaces {
                    if iface.is_loopback() {
                        continue;
                    }
                    if iface.name.to_lowercase().contains(&needle) {
                        let ip = iface.ip().to_string();
                        return VpnStatus {
                            protected: true,
                            mode: "adapter".into(),
                            detail: format!("{} · {}", iface.name, ip),
                        };
                    }
                }
            }
            VpnStatus {
                protected: false,
                mode: "adapter".into(),
                detail: format!(
                    "{} adapter not found — VPN tunnel is down",
                    settings.vpn_adapter_name
                ),
            }
        }
    }
}
