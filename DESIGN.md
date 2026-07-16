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

## Distribution & auto-update (added 2026-07-16)

- Packaged as a signed Windows NSIS installer (`bundle.targets: ["nsis"]`,
  `createUpdaterArtifacts: true`, per-user install, no UAC on update).
- Public repo: https://github.com/gant123/tnm-downloader (source + releases).
- Auto-updater (`tauri-plugin-updater` + `tauri-plugin-process`): on launch the
  app polls `releases/latest/download/latest.json`, and shows a non-blocking
  banner when a newer signed version exists. Clicking it pauses active
  torrents, downloads, verifies the minisign signature against the embedded
  pubkey, installs, and relaunches. Settings has a manual "Check for updates".
- Signing key: `~/.tauri/tnm-downloader.key` (minisign, no passphrase). NEVER
  committed (gitignored). **Back this up** — losing it means no future update
  can be verified by installed copies.
- Cut a release with `scripts/release.ps1 -Version X.Y.Z -Notes "..."` — it
  bumps versions, builds+signs, writes `latest.json` (handling GitHub's
  space→dot asset rename), tags, and publishes the GitHub release.
- Note: minisign ≠ Authenticode, so SmartScreen warns on first manual install
  (not on auto-updates). An OS code-signing cert is a future step.

## Download layout (v0.2.0, 2026-07-16)

Every torrent downloads into its own subfolder named after the torrent
(`download_dir/<torrent name>/…`), single- and multi-file alike. Implemented in
`engine.rs::add_source` by deriving the name at add-time (magnet `dn` or
`.torrent` `info.name`) and passing it as librqbit's `sub_folder`, rather than
overriding `output_folder` (which bypassed librqbit's subfolder logic and
dumped multi-file torrents loose). Remote `.torrent` URLs, whose name isn't
known until fetched, fall back to librqbit's default (still wraps multi-file).

## Proxy mode keeps everything behind the proxy (v0.2.1, 2026-07-16)

librqbit announces to a torrent's udp:// trackers over the raw connection even
when a SOCKS5 proxy is set (it has no proxy-aware UDP path and `disable_trackers`
is a no-op in 8.1.1), which leaks the real IP. So in proxy mode `add_source`
strips udp:// trackers before librqbit sees them — from magnets (rebuild the
`tr` params) and from .torrent files (re-encode keeping only http(s) trackers,
splicing the original `info` dict bytes verbatim so the info-hash is unchanged;
see `torrent_http_only_bytes`). Peer discovery through the proxy then relies on
a broad injected HTTP/HTTPS tracker list (`PROXY_MODE_HTTP_TRACKERS`) plus PEX,
which rides the already-proxied peer connections. DHT stays disabled (UDP).
Unit tests in engine.rs cover the infohash-preserving re-encode and magnet strip.
