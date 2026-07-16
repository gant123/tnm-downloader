import { invoke } from "@tauri-apps/api/core";
import type {
  Settings,
  TorrentDetail,
  TorrentRow,
  VpnStatus,
  WgSetupResult,
} from "./types";

export const listTorrents = () => invoke<TorrentRow[]>("list_torrents");
export const addTorrent = (source: string) =>
  invoke<number>("add_torrent", { source });
export const pauseTorrent = (id: number) => invoke("pause_torrent", { id });
export const resumeTorrent = (id: number) => invoke("resume_torrent", { id });
export const removeTorrent = (id: number, deleteFiles: boolean) =>
  invoke("remove_torrent", { id, deleteFiles });
export const getTorrentDetail = (id: number) =>
  invoke<TorrentDetail>("get_torrent_detail", { id });
export const setTorrentFiles = (id: number, files: number[]) =>
  invoke("set_torrent_files", { id, files });
export const setKeepSeeding = (id: number, keep: boolean) =>
  invoke("set_keep_seeding", { id, keep });
export const getSettings = () => invoke<Settings>("get_settings");
export const saveSettings = (settings: Settings) =>
  invoke("save_settings", { settings });
export const getVpnStatus = () => invoke<VpnStatus>("get_vpn_status");
export const setupNordWireguard = (token: string) =>
  invoke<WgSetupResult>("setup_nord_wireguard", { token });
export const openWireguardConfig = () => invoke("open_wireguard_config");
export const openDownloadFolder = () => invoke("open_download_folder");
