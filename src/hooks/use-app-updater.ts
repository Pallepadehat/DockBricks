import * as React from "react";
import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";

type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "current"
  | "unavailable"
  | "downloading"
  | "ready"
  | "error";

export type AppUpdaterState = {
  status: UpdateStatus;
  update: Update | null;
  currentVersion: string | null;
  error: string | null;
  progress: number | null;
  downloadedBytes: number;
  contentLength: number | null;
  lastCheckedAt: Date | null;
  checkForUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;
  relaunchApp: () => Promise<void>;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isMissingReleaseManifest(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();

  return (
    message.includes("valid release json") ||
    message.includes("latest.json") ||
    message.includes("404") ||
    message.includes("not found")
  );
}

export function useAppUpdater(autoCheck = true): AppUpdaterState {
  const [status, setStatus] = React.useState<UpdateStatus>("idle");
  const [update, setUpdate] = React.useState<Update | null>(null);
  const [currentVersion, setCurrentVersion] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState<number | null>(null);
  const [downloadedBytes, setDownloadedBytes] = React.useState(0);
  const [contentLength, setContentLength] = React.useState<number | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = React.useState<Date | null>(null);

  React.useEffect(() => {
    void getVersion().then(setCurrentVersion).catch(() => setCurrentVersion(null));
  }, []);

  const checkForUpdate = React.useCallback(async () => {
    setStatus("checking");
    setError(null);
    setProgress(null);

    try {
      const nextUpdate = await check({ timeout: 30_000 });
      setUpdate(nextUpdate);
      setLastCheckedAt(new Date());
      setStatus(nextUpdate ? "available" : "current");
    } catch (nextError) {
      setUpdate(null);
      setLastCheckedAt(new Date());

      if (isMissingReleaseManifest(nextError)) {
        setError(null);
        setStatus("unavailable");
        return;
      }

      setError(getErrorMessage(nextError));
      setStatus("error");
    }
  }, []);

  const installUpdate = React.useCallback(async () => {
    if (!update) return;

    setStatus("downloading");
    setError(null);
    setProgress(0);
    setDownloadedBytes(0);
    setContentLength(null);

    let received = 0;
    let total: number | null = null;

    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? null;
          received = 0;
          setContentLength(total);
          setDownloadedBytes(0);
          setProgress(total ? 0 : null);
          return;
        }

        if (event.event === "Progress") {
          received += event.data.chunkLength;
          setDownloadedBytes(received);
          setProgress(total ? Math.min(100, Math.round((received / total) * 100)) : null);
          return;
        }

        if (event.event === "Finished") {
          setDownloadedBytes(total ?? received);
          setProgress(100);
        }
      });
      setStatus("ready");
    } catch (nextError) {
      setError(getErrorMessage(nextError));
      setStatus("error");
    }
  }, [update]);

  const relaunchApp = React.useCallback(async () => {
    await relaunch();
  }, []);

  React.useEffect(() => {
    if (autoCheck) {
      void checkForUpdate();
    }
  }, [autoCheck, checkForUpdate]);

  return {
    status,
    update,
    currentVersion,
    error,
    progress,
    downloadedBytes,
    contentLength,
    lastCheckedAt,
    checkForUpdate,
    installUpdate,
    relaunchApp,
  };
}
