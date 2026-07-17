//! Automation loops: a watch folder that auto-adds .torrent files, and RSS
//! feeds that auto-add new torrents matching a title filter.

use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};

use crate::engine::{self, AppState};

// ----------------------------------------------------------------- watch folder

/// Every few seconds, add any *.torrent in the watch folder, then move it into
/// a `.added` subfolder so it isn't picked up again.
pub fn spawn_watch_loop(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(6)).await;
            let folder = {
                let state = app.state::<Arc<AppState>>().inner().clone();
                let f = state.settings.read().watch_folder.clone();
                f
            };
            if folder.trim().is_empty() {
                continue;
            }
            let dir = PathBuf::from(&folder);
            if !dir.is_dir() {
                continue;
            }
            let added_dir = dir.join(".added");

            let entries: Vec<PathBuf> = match std::fs::read_dir(&dir) {
                Ok(rd) => rd
                    .flatten()
                    .map(|e| e.path())
                    .filter(|p| {
                        p.is_file()
                            && p.extension()
                                .map(|e| e.eq_ignore_ascii_case("torrent"))
                                .unwrap_or(false)
                    })
                    .collect(),
                Err(_) => continue,
            };

            for path in entries {
                let src = path.to_string_lossy().to_string();
                match engine::add_source(&app, src).await {
                    Ok(_) => {
                        std::fs::create_dir_all(&added_dir).ok();
                        if let Some(name) = path.file_name() {
                            let _ = std::fs::rename(&path, added_dir.join(name));
                        }
                        let _ = app.emit(
                            "automation-event",
                            format!("Watch folder added {}", path.file_name().and_then(|n| n.to_str()).unwrap_or("")),
                        );
                    }
                    Err(e) => eprintln!("watch folder: couldn't add {}: {e}", path.display()),
                }
            }
        }
    });
}

// ----------------------------------------------------------------- RSS

fn seen_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join("rss_seen.json"))
}

fn load_seen(app: &AppHandle) -> HashSet<String> {
    seen_path(app)
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_seen(app: &AppHandle, seen: &HashSet<String>) {
    if let Some(p) = seen_path(app) {
        // Keep the file bounded so it can't grow forever.
        let trimmed: Vec<&String> = seen.iter().take(4000).collect();
        if let Ok(json) = serde_json::to_string(&trimmed) {
            if let Some(parent) = p.parent() {
                std::fs::create_dir_all(parent).ok();
            }
            std::fs::write(p, json).ok();
        }
    }
}

struct RssItem {
    title: String,
    /// A magnet: URI or http(s) .torrent URL to add.
    source: String,
    guid: String,
}

fn xml_decode(s: &str) -> String {
    s.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .trim()
        .to_string()
}

/// Pull the text of the first `<tag>…</tag>` (CDATA-aware) within `block`.
fn tag_text(block: &str, tag: &str) -> Option<String> {
    let open = format!("<{tag}");
    let start = block.find(&open)?;
    let after_open = block[start..].find('>')? + start + 1;
    let close = format!("</{tag}>");
    let end = block[after_open..].find(&close)? + after_open;
    let raw = block[after_open..end].trim();
    let raw = raw
        .strip_prefix("<![CDATA[")
        .and_then(|r| r.strip_suffix("]]>"))
        .unwrap_or(raw);
    Some(xml_decode(raw))
}

/// Find a magnet: URI or .torrent URL anywhere in an item block.
fn find_source(block: &str) -> Option<String> {
    let decoded = xml_decode(block);
    let hay = if decoded.contains("magnet:") || decoded.contains(".torrent") {
        decoded
    } else {
        block.to_string()
    };
    if let Some(i) = hay.find("magnet:?") {
        let rest = &hay[i..];
        let end = rest
            .find(|c: char| c == '"' || c == '\'' || c == '<' || c == ' ' || c == '\n')
            .unwrap_or(rest.len());
        return Some(rest[..end].to_string());
    }
    // http(s)://….torrent
    for proto in ["https://", "http://"] {
        let mut from = 0;
        while let Some(i) = hay[from..].find(proto) {
            let abs = from + i;
            let rest = &hay[abs..];
            let end = rest
                .find(|c: char| c == '"' || c == '\'' || c == '<' || c == ' ' || c == '\n')
                .unwrap_or(rest.len());
            let url = &rest[..end];
            if url.to_lowercase().contains(".torrent") {
                return Some(url.to_string());
            }
            from = abs + proto.len();
        }
    }
    None
}

fn parse_rss(xml: &str) -> Vec<RssItem> {
    let mut items = Vec::new();
    // Support both RSS <item> and Atom <entry>.
    for (open, close) in [("<item", "</item>"), ("<entry", "</entry>")] {
        let mut from = 0;
        while let Some(i) = xml[from..].find(open) {
            let start = from + i;
            let Some(rel_end) = xml[start..].find(close) else {
                break;
            };
            let end = start + rel_end + close.len();
            let block = &xml[start..end];
            from = end;
            let title = tag_text(block, "title").unwrap_or_default();
            if let Some(source) = find_source(block) {
                let guid = tag_text(block, "guid")
                    .or_else(|| tag_text(block, "id"))
                    .or_else(|| tag_text(block, "link"))
                    .unwrap_or_else(|| source.clone());
                items.push(RssItem { title, source, guid });
            }
        }
        if !items.is_empty() {
            break;
        }
    }
    items
}

async fn fetch(url: &str) -> Option<String> {
    let client = reqwest::Client::builder()
        .user_agent("TNM-Downloader")
        .timeout(Duration::from_secs(20))
        .build()
        .ok()?;
    client.get(url).send().await.ok()?.text().await.ok()
}

/// Poll enabled RSS feeds and auto-add new items whose title matches the
/// feed's (case-insensitive) filter.
pub fn spawn_rss_loop(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        // Small initial delay so the session is fully up.
        tokio::time::sleep(Duration::from_secs(20)).await;
        loop {
            let feeds = {
                let state = app.state::<Arc<AppState>>().inner().clone();
                let f = state.settings.read().rss_feeds.clone();
                f
            };
            let mut seen = load_seen(&app);
            let mut changed = false;

            for feed in feeds.iter().filter(|f| f.enabled && !f.url.trim().is_empty()) {
                let Some(xml) = fetch(feed.url.trim()).await else {
                    continue;
                };
                let filter = feed.filter.trim().to_lowercase();
                for item in parse_rss(&xml) {
                    if seen.contains(&item.guid) {
                        continue;
                    }
                    let matches = filter.is_empty() || item.title.to_lowercase().contains(&filter);
                    seen.insert(item.guid.clone());
                    changed = true;
                    if !matches {
                        continue;
                    }
                    match engine::add_source(&app, item.source.clone()).await {
                        Ok(_) => {
                            let _ = app.emit(
                                "automation-event",
                                format!("RSS added: {}", if item.title.is_empty() { &item.source } else { &item.title }),
                            );
                        }
                        Err(e) => eprintln!("rss: couldn't add {}: {e}", item.title),
                    }
                }
            }

            if changed {
                save_seen(&app, &seen);
            }
            tokio::time::sleep(Duration::from_secs(600)).await;
        }
    });
}
