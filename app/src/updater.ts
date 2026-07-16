import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

/** Returns an available Update, or null when already current / on any error. */
export async function checkForUpdate(): Promise<Update | null> {
  try {
    return await check();
  } catch (e) {
    // Offline, rate-limited, or bad manifest — never block the app over an update check.
    console.error("update check failed", e);
    return null;
  }
}

export interface UpdateProgress {
  downloaded: number;
  total?: number;
}

/**
 * Download and install an update. On Windows the installer kills this process
 * before `relaunch()` runs, so no critical logic should follow the install.
 */
export async function installUpdate(
  update: Update,
  onProgress?: (p: UpdateProgress) => void,
): Promise<void> {
  let downloaded = 0;
  let total: number | undefined;
  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case "Started":
        total = event.data.contentLength;
        onProgress?.({ downloaded, total });
        break;
      case "Progress":
        downloaded += event.data.chunkLength;
        onProgress?.({ downloaded, total });
        break;
      case "Finished":
        onProgress?.({ downloaded, total });
        break;
    }
  });
  await relaunch();
}
