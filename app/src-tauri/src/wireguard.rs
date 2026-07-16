//! Self-managed NordVPN WireGuard (NordLynx) — a full tunnel that carries
//! everything, including DHT and UDP trackers, so torrents complete while all
//! traffic stays behind Nord. No NordVPN app required: we call Nord's public
//! API with the user's access token to fetch their NordLynx private key and a
//! recommended WireGuard server, then write a standard WireGuard config the
//! user activates with the tiny official WireGuard for Windows client.

use serde::Serialize;

/// The tunnel/adapter name TNM writes and then watches via adapter mode.
pub const TUNNEL_NAME: &str = "tnm-nord";
const NORD_DNS: &str = "103.86.96.100, 103.86.99.100";
const WG_PORT: u16 = 51820;

#[derive(Serialize, Clone)]
pub struct WgSetupResult {
    pub config_path: String,
    pub tunnel_name: String,
    pub server_hostname: String,
    pub country: String,
    /// Whether the official WireGuard for Windows client is installed.
    pub wireguard_installed: bool,
}

struct Server {
    hostname: String,
    endpoint_ip: String,
    country: String,
    public_key: String,
}

fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent("TNM-Downloader")
        .build()
        .unwrap_or_default()
}

/// Nord API: exchange the access token for the account's NordLynx private key.
/// Basic auth is username "token", password = the access token.
async fn fetch_private_key(token: &str) -> Result<String, String> {
    let resp = client()
        .get("https://api.nordvpn.com/v1/users/services/credentials")
        .basic_auth("token", Some(token))
        .send()
        .await
        .map_err(|e| format!("couldn't reach Nord API: {e}"))?;
    if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err("Nord rejected the access token. Generate a fresh one at nordaccount.com → NordVPN → Set up manually.".into());
    }
    if !resp.status().is_success() {
        return Err(format!("Nord API returned {}", resp.status()));
    }
    let v: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("bad response from Nord: {e}"))?;
    v.get("nordlynx_private_key")
        .and_then(|k| k.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .ok_or_else(|| "Nord response didn't include a WireGuard key.".to_string())
}

/// Nord API: a recommended WireGuard server (hostname, endpoint IP, pubkey).
async fn fetch_recommended_server() -> Result<Server, String> {
    let url = "https://api.nordvpn.com/v1/servers/recommendations?filters[servers_technologies][identifier]=wireguard_udp&limit=1";
    let resp = client()
        .get(url)
        .send()
        .await
        .map_err(|e| format!("couldn't reach Nord API: {e}"))?;
    let arr: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("bad server list from Nord: {e}"))?;
    let s = arr
        .get(0)
        .ok_or_else(|| "Nord returned no WireGuard servers.".to_string())?;
    let hostname = s
        .get("hostname")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();
    let endpoint_ip = s
        .get("station")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "server had no endpoint address".to_string())?
        .to_string();
    let country = s
        .pointer("/locations/0/country/name")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let public_key = s
        .get("technologies")
        .and_then(|t| t.as_array())
        .and_then(|techs| {
            techs.iter().find_map(|t| {
                if t.get("identifier").and_then(|i| i.as_str()) == Some("wireguard_udp") {
                    t.get("metadata")
                        .and_then(|m| m.as_array())
                        .and_then(|md| {
                            md.iter().find_map(|e| {
                                if e.get("name").and_then(|n| n.as_str()) == Some("public_key") {
                                    e.get("value").and_then(|v| v.as_str()).map(String::from)
                                } else {
                                    None
                                }
                            })
                        })
                } else {
                    None
                }
            })
        })
        .ok_or_else(|| "server had no WireGuard public key".to_string())?;
    Ok(Server {
        hostname,
        endpoint_ip,
        country,
        public_key,
    })
}

fn build_config(private_key: &str, server: &Server) -> String {
    format!(
        "[Interface]\n\
         PrivateKey = {private_key}\n\
         Address = 10.5.0.2/32\n\
         DNS = {NORD_DNS}\n\
         \n\
         [Peer]\n\
         PublicKey = {pubkey}\n\
         AllowedIPs = 0.0.0.0/0, ::/0\n\
         Endpoint = {endpoint}:{port}\n\
         PersistentKeepalive = 25\n",
        private_key = private_key,
        pubkey = server.public_key,
        endpoint = server.endpoint_ip,
        port = WG_PORT,
    )
}

pub fn wireguard_installed() -> bool {
    std::path::Path::new(r"C:\Program Files\WireGuard\wireguard.exe").exists()
}

/// Generate the Nord WireGuard config from an access token and write it next to
/// the app config. The user then imports+activates it once in the official
/// WireGuard client (which handles elevation cleanly); TNM watches the tunnel.
pub async fn setup(token: &str, config_dir: &std::path::Path) -> Result<WgSetupResult, String> {
    let token = token.trim();
    if token.is_empty() {
        return Err("Paste your Nord access token first.".into());
    }
    let (private_key, server) =
        tokio::try_join!(fetch_private_key(token), fetch_recommended_server())?;
    let config = build_config(&private_key, &server);

    std::fs::create_dir_all(config_dir).ok();
    let config_path = config_dir.join(format!("{TUNNEL_NAME}.conf"));
    std::fs::write(&config_path, &config).map_err(|e| format!("couldn't write config: {e}"))?;

    Ok(WgSetupResult {
        config_path: config_path.to_string_lossy().to_string(),
        tunnel_name: TUNNEL_NAME.to_string(),
        server_hostname: server.hostname,
        country: server.country,
        wireguard_installed: wireguard_installed(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_has_required_fields() {
        let s = Server {
            hostname: "us9625.nordvpn.com".into(),
            endpoint_ip: "145.14.135.27".into(),
            country: "United States".into(),
            public_key: "8pRFH/FfMBs3eBJCM2ABFoOs/13n78LYQvoovZVLdgI=".into(),
        };
        let cfg = build_config("PRIVKEYPLACEHOLDER=", &s);
        assert!(cfg.contains("PrivateKey = PRIVKEYPLACEHOLDER="));
        assert!(cfg.contains("PublicKey = 8pRFH/FfMBs3eBJCM2ABFoOs/13n78LYQvoovZVLdgI="));
        assert!(cfg.contains("Endpoint = 145.14.135.27:51820"));
        assert!(cfg.contains("AllowedIPs = 0.0.0.0/0, ::/0"));
        assert!(cfg.contains("PersistentKeepalive = 25"));
    }
}
