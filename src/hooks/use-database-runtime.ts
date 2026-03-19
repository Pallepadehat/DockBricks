import * as React from "react";
import {
  deleteContainer,
  inspectContainer,
  startContainer,
  stopContainer,
} from "@/lib/tauri-commands";
import { containerTargetFor } from "@/lib/database-utils";
import type { Database } from "@/types/models";

export type RuntimeState = {
  exists: boolean;
  running: boolean;
  loading: boolean;
  error: string | null;
};

type RuntimeActionResult =
  | { ok: true }
  | { ok: false; error: string; notFound?: boolean };

export function useDatabaseRuntime(databases: Database[], dockerRunning: boolean) {
  const [runtimeByDbId, setRuntimeByDbId] = React.useState<Record<string, RuntimeState>>({});
  const [actionBusyByDbId, setActionBusyByDbId] = React.useState<Record<string, boolean>>({});

  const refreshContainerState = React.useCallback(
    async (db: Database) => {
      if (!dockerRunning) {
        setRuntimeByDbId((prev) => {
          const next = { ...prev };
          delete next[db.id];
          return next;
        });
        return;
      }

      setRuntimeByDbId((prev) => ({
        ...prev,
        [db.id]: {
          exists: prev[db.id]?.exists ?? true,
          running: prev[db.id]?.running ?? false,
          loading: true,
          error: null,
        },
      }));

      try {
        const status = await inspectContainer(containerTargetFor(db));
        setRuntimeByDbId((prev) => ({
          ...prev,
          [db.id]: {
            exists: status.exists,
            running: status.running,
            loading: false,
            error: status.error,
          },
        }));
      } catch (error) {
        setRuntimeByDbId((prev) => ({
          ...prev,
          [db.id]: {
            exists: false,
            running: false,
            loading: false,
            error: String(error),
          },
        }));
      }
    },
    [dockerRunning],
  );

  React.useEffect(() => {
    if (!dockerRunning || databases.length === 0) {
      setRuntimeByDbId({});
      return;
    }

    void Promise.all(databases.map((db) => refreshContainerState(db)));

    const timer = setInterval(() => {
      void Promise.all(databases.map((db) => refreshContainerState(db)));
    }, 10_000);

    return () => clearInterval(timer);
  }, [databases, dockerRunning, refreshContainerState]);

  const toggleContainerState = React.useCallback(
    async (db: Database): Promise<RuntimeActionResult> => {
      if (!dockerRunning) {
        return { ok: false, error: "Docker is not running." };
      }

      const runtime = runtimeByDbId[db.id];
      if (!runtime || runtime.loading || !runtime.exists) {
        return { ok: false, error: "Container was not found for this database.", notFound: true };
      }

      const target = containerTargetFor(db);
      setActionBusyByDbId((prev) => ({ ...prev, [db.id]: true }));

      try {
        const result = runtime.running
          ? await stopContainer(target)
          : await startContainer(target);

        if (!result.success) {
          return { ok: false, error: result.error ?? "Failed to change container state." };
        }

        return { ok: true };
      } catch (error) {
        return { ok: false, error: String(error) };
      } finally {
        setActionBusyByDbId((prev) => ({ ...prev, [db.id]: false }));
        void refreshContainerState(db);
      }
    },
    [dockerRunning, refreshContainerState, runtimeByDbId],
  );

  const deleteContainerForDatabase = React.useCallback(
    async (db: Database): Promise<RuntimeActionResult> => {
      if (!dockerRunning) {
        return { ok: false, error: "Docker is not running." };
      }

      try {
        const result = await deleteContainer(containerTargetFor(db));
        if (!result.success && !result.not_found) {
          return { ok: false, error: result.error ?? "Failed to delete container." };
        }

        return { ok: true };
      } catch (error) {
        return { ok: false, error: String(error) };
      }
    },
    [dockerRunning],
  );

  const clearRuntimeForDatabase = React.useCallback((databaseId: string) => {
    setRuntimeByDbId((prev) => {
      const next = { ...prev };
      delete next[databaseId];
      return next;
    });
    setActionBusyByDbId((prev) => {
      const next = { ...prev };
      delete next[databaseId];
      return next;
    });
  }, []);

  return {
    runtimeByDbId,
    actionBusyByDbId,
    refreshContainerState,
    toggleContainerState,
    deleteContainerForDatabase,
    clearRuntimeForDatabase,
  };
}
