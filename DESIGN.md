# TNM Downloader — Design Document

> Three names. One powerful downloader.

A modern BitTorrent client for Windows with first-class NordVPN protection.

## Decisions (agreed 2026-07-15)

| Area | Decision |
|------|----------|
| Stack | Tauri 2 (Rust) + React/TypeScript frontend, `librqbit` torrent engine |
| VPN | Bind torrent traffic to the NordLynx adapter + kill switch; optional auto-connect of the NordVPN app |
| Seeding | Upload only while downloading; stop automatically at 100% (per-torrent "keep seeding" override) |
| UI | Modern hybrid: sidebar filters, clean rows with progress bars, collapsible detail panel |

## Visual identity

Derived from the TNM shield logo:

- **Theme:** dark gunmetal/charcoal base (`#12161d` range), chrome/silver text
- **Blue** (`#378ADD` family) = download activity, primary accent
- **Red** (`#E24B4A` family) = upload activity, alerts, VPN-unprotected state
- **Green** = VPN protected state, completed torrents
- VPN shield status pill always visible in the header

## Layout

```
┌──────────────────────────────────────────────────────────┐
│ [TNM] TNM Downloader  [+ Add] [Magnet]   [filter] [🛡 VPN]│
├──────────┬───────────────────────────────────────────────┤
│ All      │  Torrent rows: name, size, ETA                │
│ Download │  ▓▓▓▓▓▓▓▓░░░ progress bar                     │
│ Complete │  ↓ speed  ↑ speed  %  peers                   │
│ Paused   │                                               │
│ Seeding  ├───────────────────────────────────────────────┤
│ ──tags── │  Detail panel (on select):                    │
│ Movies…  │  General | Files | Peers | Trackers           │
├──────────┴───────────────────────────────────────────────┤
│ ↓ total  ↑ total  DHT nodes        🛡 bound to NordLynx  │
└──────────────────────────────────────────────────────────┘
```

## Core features (v1)

- Magnet links + .torrent files: drag & drop, paste, open-with, `magnet:` protocol handler
- Per-file selection and priorities inside a torrent
- DHT, PEX, UDP trackers (via librqbit)
- Sequential download toggle (watch video before it finishes)
- Global + per-torrent speed limits
- Download queue, categories/tags
- Pause/resume/remove (with or without data)
- Tray icon, Windows notifications on completion
- Session persistence — resume everything on app restart

## VPN protection design (updated 2026-07-15: fully in-app, no NordVPN.exe)

Two modes, chosen in settings. **Proxy mode is the default.**

1. **Nord SOCKS5 proxy mode (default):** the user enters their Nord *service
   credentials* (Nord Account dashboard → NordVPN → Manual setup) once in TNM
   settings. The engine routes all peer connections and HTTP(S) tracker
   announces through Nord's SOCKS5 servers (`*.socks.nordhold.net:1080`).
   DHT, UDP trackers, the listener, and UPnP are disabled in this mode so
   nothing can leak around the proxy — the engine is physically unable to
   dial peers directly. A short list of HTTP(S) trackers is injected to keep
   peer discovery healthy without DHT. Changing proxy settings rebuilds the
   torrent session live (no app restart).
2. **Adapter watchdog mode:** for users running any system-wide VPN. Watches
   for a configurable adapter name (default NordLynx) every ~2 s; if it
   disappears → pause all torrents instantly (kill switch), notify, and
   auto-resume when it returns (configurable).
3. **Strict mode (default ON, both modes):** transfers cannot be added or
   resumed while protection is inactive, and everything is paused if
   protection drops.

## Seeding policy

- While downloading: normal upload (tit-for-tat requires it for good speeds)
- On completion: stop the torrent (no hosting files back) — DEFAULT
- Per-torrent override: "keep seeding" with optional ratio/time limit

## v2 ideas (not now)

- RSS feeds, built-in search, bandwidth scheduler, remote web UI, streaming player integration

## Project layout

```
TNM/
├── DESIGN.md            ← this file
├── assets/logo.png      ← original shield logo
└── app/                 ← Tauri project
    ├── src/             ← React frontend
    └── src-tauri/       ← Rust backend (librqbit session, VPN watcher)
```
