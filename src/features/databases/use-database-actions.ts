import * as React from "react";

import {
  buildConnectionString,
  containerTargetFor,
  humanizeCreateError,
} from "@/lib/database-utils";
import {
  createDatabase,
  inspectContainer,
  recreateDatabase,
  renameContainer,
} from "@/lib/tauri-commands";
import type { RuntimeActionResult } from "@/hooks/use-database-runtime";
import type { ContainerEngine, Database } from "@/types/models";

type UseDatabaseActionsOptions = {
  databases: Database[];
  setDatabases: React.Dispatch<React.SetStateAction<Database[]>>;
  selectedCategory: string | null;
  selectedEngine: ContainerEngine;
  editingDatabaseId: string | null;
  setEditingDatabaseId: React.Dispatch<React.SetStateAction<string | null>>;
  setShowCreateDatabase: React.Dispatch<React.SetStateAction<boolean>>;
  setShowEditDatabase: React.Dispatch<React.SetStateAction<boolean>>;
  refreshContainerState: (db: Database) => Promise<void>;
  toggleContainerState: (db: Database) => Promise<RuntimeActionResult>;
  deleteContainerForDatabase: (db: Database) => Promise<RuntimeActionResult>;
  clearRuntimeForDatabase: (databaseId: string) => void;
};

export function useDatabaseActions({
  databases,
  setDatabases,
  selectedCategory,
  selectedEngine,
  editingDatabaseId,
  setEditingDatabaseId,
  setShowCreateDatabase,
  setShowEditDatabase,
  refreshContainerState,
  toggleContainerState,
  deleteContainerForDatabase,
  clearRuntimeForDatabase,
}: UseDatabaseActionsOptions) {
  const [creatingByDbId, setCreatingByDbId] = React.useState<Record<string, boolean>>({});
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [pendingDeleteDatabaseId, setPendingDeleteDatabaseId] = React.useState<string | null>(null);

  const handleCreateDatabase = React.useCallback(
    async (data: Omit<Database, "id" | "containerId">) => {
      setCreateError(null);
      const engineAtCreate = data.engine ?? selectedEngine;

      const normalizedCategoryIds =
        selectedCategory && !data.categoryIds.includes(selectedCategory)
          ? [...data.categoryIds, selectedCategory]
          : data.categoryIds;
      const normalizedData: Omit<Database, "id" | "containerId"> = {
        ...data,
        engine: engineAtCreate,
        categoryIds: normalizedCategoryIds,
      };

      const optimisticId = crypto.randomUUID();
      const optimisticDatabase: Database = {
        id: optimisticId,
        ...normalizedData,
        engine: engineAtCreate,
      };

      setDatabases((prev) => [...prev, optimisticDatabase]);
      setCreatingByDbId((prev) => ({ ...prev, [optimisticId]: true }));
      setShowCreateDatabase(false);

      void (async () => {
        try {
          const result = await createDatabase({
            engine: engineAtCreate,
            name: normalizedData.name,
            service: normalizedData.service,
            version: normalizedData.version,
            port: normalizedData.port,
            password: normalizedData.password,
          });

          if (!result.success) {
            throw new Error(humanizeCreateError(result.error, normalizedData.port));
          }

          const createdDatabase: Database = {
            ...optimisticDatabase,
            containerId: result.container_id ?? undefined,
          };

          setDatabases((prev) => {
            const existingIndex = prev.findIndex((db) => db.id === optimisticId);
            if (existingIndex === -1) {
              return [...prev, createdDatabase];
            }

            const next = [...prev];
            next[existingIndex] = createdDatabase;
            return next;
          });
          void refreshContainerState(createdDatabase);
        } catch (error) {
          let containerActuallyExists = false;
          try {
            const recoveredStatus = await inspectContainer(
              engineAtCreate,
              containerTargetFor(optimisticDatabase),
            );
            containerActuallyExists = recoveredStatus.exists;
          } catch {
            containerActuallyExists = false;
          }

          if (containerActuallyExists) {
            setDatabases((prev) => {
              const exists = prev.some((db) => db.id === optimisticId);
              return exists ? prev : [...prev, optimisticDatabase];
            });
            void refreshContainerState(optimisticDatabase);
            setCreateError(
              "Container was created, but the create response was inconsistent. The entry was kept.",
            );
          } else {
            setDatabases((prev) => prev.filter((db) => db.id !== optimisticId));
            clearRuntimeForDatabase(optimisticId);
            setCreateError(String(error));
            window.alert(String(error));
          }
        } finally {
          setCreatingByDbId((prev) => {
            const next = { ...prev };
            delete next[optimisticId];
            return next;
          });
        }
      })();
    },
    [
      clearRuntimeForDatabase,
      refreshContainerState,
      selectedCategory,
      selectedEngine,
      setDatabases,
      setShowCreateDatabase,
    ],
  );

  const handleEditDatabase = React.useCallback(
    async (data: Omit<Database, "id" | "containerId">) => {
      if (!editingDatabaseId) return;
      const current = databases.find((db) => db.id === editingDatabaseId);
      if (!current) return;

      const engineForDb = current.engine ?? selectedEngine;
      const nameChanged = current.name.trim() !== data.name.trim();
      const recreateRequired =
        current.service !== data.service ||
        current.version !== data.version ||
        current.port !== data.port ||
        current.password !== data.password;

      if (recreateRequired) {
        const recreateResult = await recreateDatabase({
          engine: engineForDb,
          target: containerTargetFor(current),
          req: {
            engine: engineForDb,
            name: data.name,
            service: data.service,
            version: data.version,
            port: data.port,
            password: data.password,
          },
        });

        if (!recreateResult.success) {
          window.alert(recreateResult.error ?? "Failed to recreate container.");
          return;
        }

        setDatabases((prev) =>
          prev.map((db) =>
            db.id === editingDatabaseId
              ? {
                  ...db,
                  ...data,
                  containerId: recreateResult.container_id ?? db.containerId,
                }
              : db,
          ),
        );

        const updatedDb: Database = {
          ...current,
          ...data,
          containerId: recreateResult.container_id ?? current.containerId,
        };
        void refreshContainerState(updatedDb);
        setShowEditDatabase(false);
        setEditingDatabaseId(null);
        return;
      }

      if (nameChanged) {
        const renameResult = await renameContainer(
          engineForDb,
          containerTargetFor(current),
          data.name,
        );

        if (!renameResult.success && !renameResult.not_found) {
          window.alert(renameResult.error ?? "Failed to rename container.");
          return;
        }
      }

      setDatabases((prev) =>
        prev.map((db) =>
          db.id === editingDatabaseId
            ? {
                ...db,
                ...data,
              }
            : db,
        ),
      );

      const updatedDb: Database = {
        ...current,
        ...data,
      };
      void refreshContainerState(updatedDb);

      setShowEditDatabase(false);
      setEditingDatabaseId(null);
    },
    [
      databases,
      editingDatabaseId,
      refreshContainerState,
      selectedEngine,
      setDatabases,
      setEditingDatabaseId,
      setShowEditDatabase,
    ],
  );

  const handleDeleteDatabaseLocal = React.useCallback(
    (databaseId: string) => {
      setDatabases((prev) => prev.filter((db) => db.id !== databaseId));
      clearRuntimeForDatabase(databaseId);

      if (editingDatabaseId === databaseId) {
        setShowEditDatabase(false);
        setEditingDatabaseId(null);
      }
    },
    [
      clearRuntimeForDatabase,
      editingDatabaseId,
      setDatabases,
      setEditingDatabaseId,
      setShowEditDatabase,
    ],
  );

  const handleConfirmDeleteDatabase = React.useCallback(async () => {
    if (!pendingDeleteDatabaseId) return;

    const db = databases.find((item) => item.id === pendingDeleteDatabaseId);
    if (!db) {
      setPendingDeleteDatabaseId(null);
      return;
    }

    setDeleting(true);
    setDeleteError(null);

    const result = await deleteContainerForDatabase(db);
    if (!result.ok) {
      setDeleteError(result.error);
      setDeleting(false);
      return;
    }

    handleDeleteDatabaseLocal(db.id);
    setPendingDeleteDatabaseId(null);
    setDeleting(false);
  }, [
    databases,
    deleteContainerForDatabase,
    handleDeleteDatabaseLocal,
    pendingDeleteDatabaseId,
  ]);

  const handleToggleContainer = React.useCallback(
    async (databaseId: string) => {
      const db = databases.find((item) => item.id === databaseId);
      if (!db) return;

      const result = await toggleContainerState(db);
      if (!result.ok) {
        window.alert(result.error);
      }
    },
    [databases, toggleContainerState],
  );

  const handleCopyConnectionString = React.useCallback(
    async (databaseId: string) => {
      const db = databases.find((item) => item.id === databaseId);
      if (!db) return;

      const connectionString = buildConnectionString(db);
      try {
        await navigator.clipboard.writeText(connectionString);
      } catch {
        window.prompt("Copy connection string:", connectionString);
      }
    },
    [databases],
  );

  const requestEditDatabase = React.useCallback(
    (databaseId: string) => {
      setCreateError(null);
      setEditingDatabaseId(databaseId);
      setShowEditDatabase(true);
    },
    [setEditingDatabaseId, setShowEditDatabase],
  );

  const requestDeleteDatabase = React.useCallback((databaseId: string) => {
    setDeleteError(null);
    setPendingDeleteDatabaseId(databaseId);
  }, []);

  return {
    creatingByDbId,
    createError,
    setCreateError,
    deleting,
    deleteError,
    setDeleteError,
    pendingDeleteDatabaseId,
    setPendingDeleteDatabaseId,
    handleCreateDatabase,
    handleEditDatabase,
    handleConfirmDeleteDatabase,
    handleToggleContainer,
    handleCopyConnectionString,
    requestEditDatabase,
    requestDeleteDatabase,
  };
}
