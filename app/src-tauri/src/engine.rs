use std::collections::{HashMap, HashSet};
use std::num::NonZeroU32;
use std::path::PathBuf;
use std::sync::Arc;

use anyhow::Context;
use librqbit::{
    api::TorrentIdOrHash, limits::LimitsConfig, torrent_from_bytes, AddTorrent, AddTorrentOptions,
    ByteBufOwned, Magnet, ManagedTorrent, Session, SessionOptions, SessionPersistenceConfig,
};
use parking_lot::{Mutex, RwLock};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_notification::NotificationExt;

use crate::config::Settings;
use crate::vpn::{self, VpnStatus};

/// Best-effort HTTP(S) trackers added in proxy mode, where UDP trackers and
/// DHT are disabled to prevent leaks and most magnets carry only UDP trackers.
const PROXY_MODE_HTTP_TRACKERS: &[&str] = &[
    "http://tracker.opentrackr.org:1337/announce",
    "http://tracker.files.fm:6969/announce",
    "http://tracker.bt4g.com:2095/announce",
    "https://tracker.gbitt.info:443/announce",
];

pub struct AppState {
    /// None while the engine is being rebuilt (e.g. proxy settings changed).
    pub session: RwLock<Option<Arc<Session>>>,
    pub settings: RwLock<Settings>,
    pub settings_path: PathBuf,
    pub session_dir: PathBuf,
    pub vpn: Mutex<VpnStatus>,
    /// Torrent ids the kill switch paused, to auto-resume on reconnect.
    pub killswitch_paused: Mutex<HashSet<usize>>,
    /// finished-flag per torrent id from the previous stats tick, to detect completions.
    pub prev_finished: Mutex<HashMap<usize, bool>>,
}

impl AppState {
    fn session(&self) -> Result<Arc<Session>, String> {
        self.session
            .read()
            .clone()
            .ok_or_else(|| "engine is restarting, try again in a second".to_string())
    }
}

fn kib_to_bps(kib: u32) -> Option<NonZeroU32> {
    NonZeroU32::new(kib.saturating_mul(1024))
}

pub async fn create_session(
    settings: &Settings,
    session_dir: PathBuf,
) -> anyhow::Result<Arc<Session>> {
    let proxied = settings.socks_url().is_some();
    let opts = SessionOptions {
        persistence: Some(SessionPersistenceConfig::Json {
            folder: Some(session_dir),
        }),
        fastresume: true,
        socks_proxy_url: settings.socks_url(),
        // In proxy mode DHT and UDP trackers would bypass the SOCKS5 tunnel
        // and leak the real IP, so run TCP-only through the proxy.
        disable_dht: proxied,
        listen_port_range: if proxied { None } else { Some(41253..41263) },
        enable_upnp_port_forwarding: !proxied,
        trackers: if proxied {
            PROXY_MODE_HTTP_TRACKERS
                .iter()
                .filter_map(|t| url::Url::parse(t).ok())
                .collect()
        } else {
            Default::default()
        },
        ratelimits: LimitsConfig {
            upload_bps: kib_to_bps(settings.upload_limit_kib),
            download_bps: kib_to_bps(settings.download_limit_kib),
        },
        ..Default::default()
    };
    Session::new_with_opts(settings.download_dir.clone(), opts)
        .await
        .context("failed to create torrent session")
}

/// Tear down the current session and build a new one from current settings.
/// Torrents are restored from session persistence.
pub async fn rebuild_session(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<Arc<AppState>>().inner().clone();
    if let Some(old) = state.session.write().take() {
        drop(old);
    }
    // Give the old session's listeners and persistence flusher a moment to die.
    tokio::time::sleep(std::time::Duration::from_millis(400)).await;

    let settings = state.settings.read().clone();
    let session = create_session(&settings, state.session_dir.clone())
        .await
        .map_err(|e| format!("{e:#}"))?;
    *state.session.write() = Some(session);
    let _ = app.emit("torrents-update", all_rows(&state));
    Ok(())
}

#[derive(Serialize, Clone)]
pub struct TorrentRow {
    pub id: usize,
    pub info_hash: String,
    pub name: String,
    pub keep_seeding: bool,
    pub stats: serde_json::Value,
}

#[derive(Serialize, Clone)]
pub struct FileRow {
    pub index: usize,
    pub path: String,
    pub len: u64,
    pub included: bool,
    pub progress: u64,
}

#[derive(Serialize, Clone)]
pub struct TorrentDetail {
    pub id: usize,
    pub info_hash: String,
    pub name: String,
    pub trackers: Vec<String>,
    pub files: Vec<FileRow>,
}

fn row_for(state: &AppState, id: usize, handle: &Arc<ManagedTorrent>) -> TorrentRow {
    let hash = handle.info_hash().as_string();
    let keep = state.settings.read().keep_seeding.contains(&hash);
    TorrentRow {
        id,
        info_hash: hash,
        name: handle
            .name()
            .unwrap_or_else(|| "(resolving metadata…)".to_string()),
        keep_seeding: keep,
        stats: serde_json::to_value(handle.stats()).unwrap_or(serde_json::Value::Null),
    }
}

pub fn all_rows(state: &AppState) -> Vec<TorrentRow> {
    let Ok(session) = state.session() else {
        return Vec::new();
    };
    let handles: Vec<(usize, Arc<ManagedTorrent>)> =
        session.with_torrents(|it| it.map(|(id, h)| (id, h.clone())).collect());
    handles
        .iter()
        .map(|(id, h)| row_for(state, *id, h))
        .collect()
}

fn get_handle(state: &AppState, id: usize) -> Result<Arc<ManagedTorrent>, String> {
    state
        .session()?
        .get(TorrentIdOrHash::Id(id))
        .ok_or_else(|| format!("torrent {id} not found"))
}

fn ensure_vpn_allows_transfers(state: &AppState) -> Result<(), String> {
    let strict = state.settings.read().strict_vpn;
    if strict && !state.vpn.lock().protected {
        let detail = state.vpn.lock().detail.clone();
        return Err(format!(
            "Protection is not active ({detail}). Strict mode is blocking transfers — fix the VPN setup or turn off strict mode in settings."
        ));
    }
    Ok(())
}

/// Turn an arbitrary torrent name into a safe single-component folder name,
/// or None if nothing usable remains.
fn sanitize_folder_name(name: &str) -> Option<String> {
    let cleaned: String = name
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            c if (c as u32) < 0x20 => '_',
            c => c,
        })
        .collect();
    // Windows dislikes trailing dots/spaces on folder names.
    let trimmed = cleaned.trim().trim_end_matches(['.', ' ']).trim();
    if trimmed.is_empty() || trimmed == "." || trimmed == ".." {
        None
    } else {
        Some(trimmed.to_string())
    }
}

/// Best-effort torrent name, known at add-time, used to give each download its
/// own subfolder. Magnets use the `dn` display name; local .torrent files use
/// the metadata `name`. Remote .torrent URLs resolve too late, so they fall
/// back to librqbit's default (which still wraps multi-file torrents).
fn torrent_subfolder(source: &str) -> Option<String> {
    let raw = if source.starts_with("magnet:") {
        Magnet::parse(source).ok().and_then(|m| m.name)
    } else if source.starts_with("http") {
        None
    } else {
        std::fs::read(source).ok().and_then(|bytes| {
            torrent_from_bytes::<ByteBufOwned>(&bytes)
                .ok()
                .and_then(|t| t.info.name.map(|n| String::from_utf8_lossy(n.0.as_ref()).into_owned()))
        })
    };
    raw.and_then(|n| sanitize_folder_name(&n))
}

pub async fn add_source(app: &AppHandle, source: String) -> Result<usize, String> {
    let state = app.state::<Arc<AppState>>();
    ensure_vpn_allows_transfers(&state)?;
    let session = state.session()?;

    let trimmed = source.trim().to_string();
    let add = if trimmed.starts_with("magnet:") || trimmed.starts_with("http") {
        AddTorrent::from_url(trimmed.clone())
    } else {
        AddTorrent::from_local_filename(&trimmed).map_err(|e| format!("{e:#}"))?
    };

    // Give every torrent its own folder named after it. Leaving output_folder
    // unset keeps the session's download dir as the base; sub_folder nests one
    // level under it. Falls back to librqbit's default when the name is unknown.
    let opts = AddTorrentOptions {
        overwrite: true,
        sub_folder: torrent_subfolder(&trimmed),
        ..Default::default()
    };

    let response = session
        .add_torrent(add, Some(opts))
        .await
        .map_err(|e| format!("{e:#}"))?;
    let handle = response
        .into_handle()
        .ok_or_else(|| "torrent was not added".to_string())?;
    let _ = app.emit("torrents-update", all_rows(&state));
    Ok(handle.id())
}

#[tauri::command]
pub fn list_torrents(state: State<'_, Arc<AppState>>) -> Vec<TorrentRow> {
    all_rows(&state)
}

#[tauri::command]
pub async fn add_torrent(app: AppHandle, source: String) -> Result<usize, String> {
    add_source(&app, source).await
}

#[tauri::command]
pub async fn pause_torrent(state: State<'_, Arc<AppState>>, id: usize) -> Result<(), String> {
    let session = state.session()?;
    let handle = get_handle(&state, id)?;
    state.killswitch_paused.lock().remove(&id);
    session.pause(&handle).await.map_err(|e| format!("{e:#}"))
}

#[tauri::command]
pub async fn resume_torrent(state: State<'_, Arc<AppState>>, id: usize) -> Result<(), String> {
    ensure_vpn_allows_transfers(&state)?;
    let session = state.session()?;
    let handle = get_handle(&state, id)?;
    state.killswitch_paused.lock().remove(&id);
    session.unpause(&handle).await.map_err(|e| format!("{e:#}"))
}

#[tauri::command]
pub async fn remove_torrent(
    state: State<'_, Arc<AppState>>,
    id: usize,
    delete_files: bool,
) -> Result<(), String> {
    state
        .session()?
        .delete(TorrentIdOrHash::Id(id), delete_files)
        .await
        .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
pub fn get_torrent_detail(
    state: State<'_, Arc<AppState>>,
    id: usize,
) -> Result<TorrentDetail, String> {
    let handle = get_handle(&state, id)?;
    let stats = handle.stats();
    let only: Option<Vec<usize>> = handle.only_files();
    let files = handle
        .with_metadata(|m| {
            m.file_infos
                .iter()
                .enumerate()
                .map(|(i, fi)| FileRow {
                    index: i,
                    path: fi.relative_filename.to_string_lossy().to_string(),
                    len: fi.len,
                    included: only.as_ref().map(|o| o.contains(&i)).unwrap_or(true),
                    progress: stats.file_progress.get(i).copied().unwrap_or(0),
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let trackers = handle
        .shared()
        .trackers
        .iter()
        .map(|u| u.to_string())
        .collect();
    Ok(TorrentDetail {
        id,
        info_hash: handle.info_hash().as_string(),
        name: handle.name().unwrap_or_default(),
        trackers,
        files,
    })
}

#[tauri::command]
pub async fn set_torrent_files(
    state: State<'_, Arc<AppState>>,
    id: usize,
    files: Vec<usize>,
) -> Result<(), String> {
    let session = state.session()?;
    let handle = get_handle(&state, id)?;
    let set: HashSet<usize> = files.into_iter().collect();
    session
        .update_only_files(&handle, &set)
        .await
        .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
pub fn set_keep_seeding(
    state: State<'_, Arc<AppState>>,
    id: usize,
    keep: bool,
) -> Result<(), String> {
    let handle = get_handle(&state, id)?;
    let hash = handle.info_hash().as_string();
    let mut settings = state.settings.write();
    settings.keep_seeding.retain(|h| h != &hash);
    if keep {
        settings.keep_seeding.push(hash);
    }
    let _ = settings.save(&state.settings_path);
    Ok(())
}

#[tauri::command]
pub fn get_settings(state: State<'_, Arc<AppState>>) -> Settings {
    state.settings.read().clone()
}

#[tauri::command]
pub async fn save_settings(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    settings: Settings,
) -> Result<(), String> {
    let needs_rebuild = {
        let mut current = state.settings.write();
        let needs_rebuild = current.engine_config_changed(&settings);
        // keep_seeding is managed through set_keep_seeding, not the settings form
        let keep = current.keep_seeding.clone();
        *current = settings;
        current.keep_seeding = keep;
        current
            .save(&state.settings_path)
            .map_err(|e| format!("{e:#}"))?;
        std::fs::create_dir_all(&current.download_dir).ok();
        needs_rebuild
    };

    if let Ok(session) = state.session() {
        let s = state.settings.read();
        session
            .ratelimits
            .set_upload_bps(kib_to_bps(s.upload_limit_kib));
        session
            .ratelimits
            .set_download_bps(kib_to_bps(s.download_limit_kib));
    }

    let status = vpn::check(&state.settings.read());
    *state.vpn.lock() = status.clone();
    let _ = app.emit("vpn-status", status);

    if needs_rebuild {
        rebuild_session(&app).await?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_vpn_status(state: State<'_, Arc<AppState>>) -> VpnStatus {
    state.vpn.lock().clone()
}

#[tauri::command]
pub fn open_download_folder(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let dir = state.settings.read().download_dir.clone();
    tauri_plugin_opener::open_path(dir.to_string_lossy().to_string(), None::<String>)
        .map_err(|e| format!("{e:#}"))
}

/// Once a second: push fresh stats to the UI, and enforce the
/// stop-on-complete seeding policy.
pub fn spawn_stats_loop(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            let state = app.state::<Arc<AppState>>().inner().clone();
            let Ok(session) = state.session() else {
                continue;
            };
            let rows = all_rows(&state);

            let stop_on_complete = state.settings.read().stop_on_complete;
            for row in &rows {
                let finished = row
                    .stats
                    .get("finished")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                let is_live = row.stats.get("state").and_then(|v| v.as_str()) == Some("live");

                let newly_finished = {
                    let mut prev = state.prev_finished.lock();
                    let was = prev.insert(row.id, finished).unwrap_or(finished);
                    !was && finished
                };
                if newly_finished {
                    let _ = app
                        .notification()
                        .builder()
                        .title("Download complete")
                        .body(&row.name)
                        .show();
                }

                if finished && is_live && stop_on_complete && !row.keep_seeding {
                    if let Some(handle) = session.get(TorrentIdOrHash::Id(row.id)) {
                        let _ = session.pause(&handle).await;
                    }
                }
            }

            let _ = app.emit("torrents-update", rows);
        }
    });
}

/// Every 2 seconds: recompute protection status. If protection is lost while
/// strict mode is on, pause everything (kill switch). Optionally resume when
/// protection returns.
pub fn spawn_vpn_watcher(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut first_check = true;
        loop {
            let state = app.state::<Arc<AppState>>().inner().clone();
            let (settings, strict, auto_resume) = {
                let s = state.settings.read();
                (s.clone(), s.strict_vpn, s.auto_resume_on_reconnect)
            };
            let status = vpn::check(&settings);
            let changed = {
                let mut cur = state.vpn.lock();
                let changed = *cur != status;
                *cur = status.clone();
                changed
            };

            if changed || first_check {
                let _ = app.emit("vpn-status", status.clone());
            }

            if !status.protected && strict {
                if let Ok(session) = state.session() {
                    let handles: Vec<(usize, Arc<ManagedTorrent>)> =
                        session.with_torrents(|it| it.map(|(id, h)| (id, h.clone())).collect());
                    let mut paused_any = false;
                    for (id, handle) in handles {
                        if !handle.is_paused() {
                            if session.pause(&handle).await.is_ok() {
                                state.killswitch_paused.lock().insert(id);
                                paused_any = true;
                            }
                        }
                    }
                    if paused_any {
                        let _ = app
                            .notification()
                            .builder()
                            .title("Protection lost — transfers paused")
                            .body("TNM paused all torrents because VPN protection went down.")
                            .show();
                        let _ = app.emit("torrents-update", all_rows(&state));
                    }
                }
            }

            if status.protected && changed && auto_resume {
                if let Ok(session) = state.session() {
                    let ids: Vec<usize> = state.killswitch_paused.lock().drain().collect();
                    for id in ids {
                        if let Some(handle) = session.get(TorrentIdOrHash::Id(id)) {
                            let _ = session.unpause(&handle).await;
                        }
                    }
                }
            }

            first_check = false;
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        }
    });
}
