import * as React from "react";
import {
  deleteContainer,
  inspectContainer,
  startContainer,
  stopContainer,
} from "@/lib/tauri-commands";
import { containerTargetFor } from "@/lib/database-utils";
import type { ContainerEngine, Database } from "@/types/models";

export type RuntimeState = {
  exists: boolean;
  running: boolean;
  loading: boolean;
  error: string | null;
};

type RuntimeActionResult =
  | { ok: true }
  | { ok: false; error: string; notFound?: boolean };

export function useDatabaseRuntime(
  databases: Database[],
  engine: ContainerEngine,
  engineRunning: boolean,
) {
  const engineLabel = engine === "docker" ? "Docker" : "Podman";
  const [runtimeByDbId, setRuntimeByDbId] = React.useState<Record<string, RuntimeState>>({});
  const [actionBusyByDbId, setActionBusyByDbId] = React.useState<Record<string, boolean>>({});

  const refreshContainerState = React.useCallback(
    async (db: Database) => {
      if (!engineRunning) {
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
        const status = await inspectContainer(engine, containerTargetFor(db));
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
    [engineRunning, engine],
  );

  React.useEffect(() => {
    if (!engineRunning || databases.length === 0) {
      setRuntimeByDbId({});
      return;
    }

    void Promise.all(databases.map((db) => refreshContainerState(db)));
    return undefined;
  }, [databases, engineRunning, refreshContainerState]);

  const toggleContainerState = React.useCallback(
    async (db: Database): Promise<RuntimeActionResult> => {
      if (!engineRunning) {
        return { ok: false, error: `${engineLabel} is not running.` };
      }

      const target = containerTargetFor(db);
      const cachedRuntime = runtimeByDbId[db.id];
      if (cachedRuntime?.loading) {
        return { ok: false, error: "Container status is still loading. Try again in a moment." };
      }

      setActionBusyByDbId((prev) => ({ ...prev, [db.id]: true }));

      try {
        let runtime = cachedRuntime;
        if (!runtime || !runtime.exists) {
          const inspected = await inspectContainer(engine, target);
          runtime = {
            exists: inspected.exists,
            running: inspected.running,
            loading: false,
            error: inspected.error,
          };
          setRuntimeByDbId((prev) => ({ ...prev, [db.id]: runtime }));
        }

        if (!runtime.exists) {
          return { ok: false, error: "Container was not found for this database.", notFound: true };
        }

        const result = runtime.running
          ? await stopContainer(engine, target)
          : await startContainer(engine, target);

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
    [engineRunning, engine, engineLabel, refreshContainerState, runtimeByDbId],
  );

  const deleteContainerForDatabase = React.useCallback(
    async (db: Database): Promise<RuntimeActionResult> => {
      if (!engineRunning) {
        return { ok: false, error: `${engineLabel} is not running.` };
      }

      try {
        const result = await deleteContainer(engine, containerTargetFor(db));
        if (!result.success && !result.not_found) {
          return { ok: false, error: result.error ?? "Failed to delete container." };
        }

        return { ok: true };
      } catch (error) {
        return { ok: false, error: String(error) };
      }
    },
    [engineRunning, engine, engineLabel],
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
