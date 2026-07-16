mod config;
mod engine;
mod vpn;
mod wireguard;

use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use engine::AppState;
use parking_lot::{Mutex, RwLock};
use tauri::Manager;
use tauri_plugin_deep_link::DeepLinkExt;

fn add_sources_from_args(app: &tauri::AppHandle, args: impl IntoIterator<Item = String>) {
    for arg in args {
        let looks_like_torrent = arg.starts_with("magnet:")
            || arg.to_lowercase().ends_with(".torrent")
            || arg.starts_with("http");
        if looks_like_torrent {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = engine::add_source(&app, arg).await {
                    eprintln!("failed to add torrent from argument: {e}");
                }
            });
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_focus();
            }
            add_sources_from_args(app, args.into_iter().skip(1));
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;

            let config_dir = app.path().app_config_dir()?;
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&config_dir).ok();
            std::fs::create_dir_all(&data_dir).ok();

            let settings_path = config_dir.join("settings.json");
            let mut settings = config::Settings::load(&settings_path);
            if settings.download_dir.as_os_str().is_empty() {
                let base = app
                    .path()
                    .download_dir()
                    .unwrap_or_else(|_| std::env::temp_dir());
                settings.download_dir = base.join("TNM");
            }
            std::fs::create_dir_all(&settings.download_dir).ok();
            let _ = settings.save(&settings_path);

            let session_dir = data_dir.join("session");
            let session = tauri::async_runtime::block_on(engine::create_session(
                &settings,
                session_dir.clone(),
            ))?;

            let initial_vpn = vpn::check(&settings);
            app.manage(Arc::new(AppState {
                session: RwLock::new(Some(session)),
                settings: RwLock::new(settings),
                settings_path,
                session_dir,
                vpn: Mutex::new(initial_vpn),
                killswitch_paused: Mutex::new(HashSet::new()),
                prev_finished: Mutex::new(HashMap::new()),
            }));

            engine::spawn_stats_loop(app.handle().clone());
            engine::spawn_vpn_watcher(app.handle().clone());

            // magnet: links routed to us by the OS
            #[cfg(desktop)]
            {
                let _ = app.deep_link().register_all();
                let handle = app.handle().clone();
                app.deep_link().on_open_url(move |event| {
                    let urls: Vec<String> = event.urls().iter().map(|u| u.to_string()).collect();
                    add_sources_from_args(&handle, urls);
                });
            }

            // .torrent file or magnet passed on first launch
            add_sources_from_args(app.handle(), std::env::args().skip(1));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            engine::list_torrents,
            engine::add_torrent,
            engine::pause_torrent,
            engine::resume_torrent,
            engine::remove_torrent,
            engine::get_torrent_detail,
            engine::set_torrent_files,
            engine::set_keep_seeding,
            engine::get_settings,
            engine::save_settings,
            engine::get_vpn_status,
            engine::setup_nord_wireguard,
            engine::open_wireguard_config,
            engine::open_download_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
