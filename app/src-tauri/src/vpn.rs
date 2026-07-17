use serde::Serialize;

use crate::config::Settings;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct ProxyStatus {
    /// Whether a proxy is configured (false = direct internet).
    pub proxy_enabled: bool,
    /// True when running direct, or when the configured proxy is reachable.
    pub ok: bool,
    pub detail: String,
}

/// Health of the connection path. Direct mode is always ok; proxy mode does a
/// quick TCP reachability check against the proxy endpoint.
pub fn check(settings: &Settings) -> ProxyStatus {
    if !settings.proxy_enabled() {
        return ProxyStatus {
            proxy_enabled: false,
            ok: true,
            detail: "Direct connection".into(),
        };
    }
    let host = settings.proxy_host.trim();
    let port = settings.proxy_port;
    let reachable = tcp_reachable(host, port);
    ProxyStatus {
        proxy_enabled: true,
        ok: reachable,
        detail: if reachable {
            format!("SOCKS5 · {host}:{port}")
        } else {
            format!("Proxy {host}:{port} unreachable")
        },
    }
}

/// Blocking TCP connect with a short timeout. Call from spawn_blocking in async
/// contexts.
fn tcp_reachable(host: &str, port: u16) -> bool {
    use std::net::ToSocketAddrs;
    let Ok(addrs) = (host, port).to_socket_addrs() else {
        return false;
    };
    for addr in addrs {
        if std::net::TcpStream::connect_timeout(&addr, std::time::Duration::from_secs(3)).is_ok() {
            return true;
        }
    }
    false
}
