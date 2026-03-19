import * as React from "react";
import { getVersion } from "@tauri-apps/api/app";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";

export type UpdaterStatus =
  | "idle"
  | "checking"
  | "up-to-date"
  | "available"
  | "downloading"
  | "installing"
  | "installed"
  | "error";

type UpdaterState = {
  currentVersion: string | null;
  availableVersion: string | null;
  notes: string | null;
  status: UpdaterStatus;
  progressPercent: number | null;
  error: string | null;
};

const INITIAL_STATE: UpdaterState = {
  currentVersion: null,
  availableVersion: null,
  notes: null,
  status: "idle",
  progressPercent: null,
  error: null,
};

export function useAppUpdater() {
  const [state, setState] = React.useState<UpdaterState>(INITIAL_STATE);
  const updateRef = React.useRef<Update | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    void getVersion()
      .then((version) => {
        if (cancelled) return;
        setState((prev) => ({ ...prev, currentVersion: version }));
      })
      .catch(() => {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          error: "Could not read app version.",
        }));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const checkForUpdates = React.useCallback(async () => {
    setState((prev) => ({
      ...prev,
      status: "checking",
      error: null,
      availableVersion: null,
      notes: null,
      progressPercent: null,
    }));
    updateRef.current = null;

    try {
      const update = await check();
      if (!update) {
        setState((prev) => ({
          ...prev,
          status: "up-to-date",
        }));
        return;
      }

      updateRef.current = update;
      setState((prev) => ({
        ...prev,
        status: "available",
        availableVersion: update.version,
        notes: update.body ?? null,
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        status: "error",
        error: String(error),
      }));
    }
  }, []);

  const installUpdate = React.useCallback(async () => {
    const update = updateRef.current;
    if (!update) {
      setState((prev) => ({
        ...prev,
        status: "error",
        error: "No update is ready to install. Check for updates first.",
      }));
      return;
    }

    let downloadedBytes = 0;
    let contentLength: number | null = null;

    setState((prev) => ({
      ...prev,
      status: "downloading",
      error: null,
      progressPercent: 0,
    }));

    try {
      await update.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === "Started") {
          contentLength = event.data.contentLength ?? null;
          downloadedBytes = 0;
          setState((prev) => ({ ...prev, status: "downloading", progressPercent: 0 }));
          return;
        }

        if (event.event === "Progress") {
          downloadedBytes += event.data.chunkLength;
          if (contentLength && contentLength > 0) {
            const percent = Math.min(
              100,
              Math.round((downloadedBytes / contentLength) * 100),
            );
            setState((prev) => ({ ...prev, status: "downloading", progressPercent: percent }));
          }
          return;
        }

        setState((prev) => ({
          ...prev,
          status: "installing",
          progressPercent: 100,
        }));
      });

      setState((prev) => ({
        ...prev,
        status: "installed",
        progressPercent: 100,
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        status: "error",
        error: String(error),
      }));
    }
  }, []);

  return {
    ...state,
    checkForUpdates,
    installUpdate,
  };
}
