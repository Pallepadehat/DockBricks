import "./App.css";
import * as React from "react";
import { DatabaseIcon } from "lucide-react";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { CreateCategoryDialog } from "@/components/create-category-dialog";
import { CreateDatabaseDialog } from "@/components/create-database-dialog";
import { DatabaseCard } from "@/components/databases/database-card";
import { DeleteDatabaseDialog } from "@/components/dialogs/delete-database-dialog";
import { SettingsDialog } from "@/components/dialogs/settings-dialog";
import { EngineWarningBanner } from "@/components/engine-warning-banner";
import { EngineOnboarding } from "@/components/onboarding/engine-onboarding";
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
import { useAppUpdater } from "@/hooks/use-app-updater";
import { useDatabaseRuntime } from "@/hooks/use-database-runtime";
import { useContainerEngineHealth } from "@/hooks/use-container-engine-health";
import { usePersistentState } from "@/hooks/use-persistent-state";
import type { Category, ContainerEngine, Database } from "@/types/models";

export default function App() {
  const [categories, setCategories] = usePersistentState<Category[]>(
    "dockbricks_categories",
    [],
  );
  const [databases, setDatabases] = usePersistentState<Database[]>(
    "dockbricks_databases",
    [],
  );
  const [containerEngine, setContainerEngine] = usePersistentState<ContainerEngine | null>(
    "dockbricks_container_engine",
    null,
  );

  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(
    null,
  );
  const [showCreateCategory, setShowCreateCategory] = React.useState(false);
  const [showCreateDatabase, setShowCreateDatabase] = React.useState(false);
  const [showSettings, setShowSettings] = React.useState(false);
  const [showEditDatabase, setShowEditDatabase] = React.useState(false);
  const [editingDatabaseId, setEditingDatabaseId] = React.useState<
    string | null
  >(null);
  const [pendingDeleteDatabaseId, setPendingDeleteDatabaseId] = React.useState<
    string | null
  >(null);

  const [creatingByDbId, setCreatingByDbId] = React.useState<Record<string, boolean>>({});
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  const selectedEngine: ContainerEngine = containerEngine ?? "docker";
  const engineLabel = selectedEngine === "docker" ? "Docker" : "Podman";

  const { engineStatus, engineChecking, showEngineWarning, retryEngineCheck } =
    useContainerEngineHealth(selectedEngine);
  const {
    currentVersion,
    status: updaterStatus,
    error: updaterError,
    availableVersion,
    notes: updateNotes,
    progressPercent: updateProgressPercent,
    checkForUpdates,
    installUpdate,
  } = useAppUpdater();

  const {
    runtimeByDbId,
    actionBusyByDbId,
    refreshContainerState,
    toggleContainerState,
    deleteContainerForDatabase,
    clearRuntimeForDatabase,
  } = useDatabaseRuntime(databases, selectedEngine, engineStatus?.running ?? false);

  if (!containerEngine) {
    return <EngineOnboarding onSelectEngine={setContainerEngine} />;
  }

  const editingDatabase =
    editingDatabaseId === null
      ? null
      : (databases.find((db) => db.id === editingDatabaseId) ?? null);

  const visibleDatabases =
    selectedCategory === null
      ? databases.filter(
          (db) => !db.engine || db.engine === selectedEngine,
        )
      : databases.filter(
          (db) =>
            (!db.engine || db.engine === selectedEngine) &&
            db.categoryIds.includes(selectedCategory),
        );

  const selectedCategoryName =
    selectedCategory === null
      ? "All"
      : (categories.find((c) => c.id === selectedCategory)?.name ?? "All");

  function handleCreateCategory(name: string) {
    const newCategory: Category = { id: crypto.randomUUID(), name };
    setCategories((prev) => [...prev, newCategory]);
  }

  async function handleCreateDatabase(
    data: Omit<Database, "id" | "containerId">,
  ) {
    setCreateError(null);
    const engineAtCreate = selectedEngine;

    const normalizedCategoryIds =
      selectedCategory && !data.categoryIds.includes(selectedCategory)
        ? [...data.categoryIds, selectedCategory]
        : data.categoryIds;
    const normalizedData: Omit<Database, "id" | "containerId"> = {
      ...data,
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
        // Recovery path: container engines can occasionally create the container
        // even if the command surface reports an error. If it exists, keep the row.
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
  }

  async function handleEditDatabase(
    data: Omit<Database, "id" | "containerId">,
  ) {
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
  }

  function handleDeleteDatabaseLocal(databaseId: string) {
    setDatabases((prev) => prev.filter((db) => db.id !== databaseId));
    clearRuntimeForDatabase(databaseId);

    if (editingDatabaseId === databaseId) {
      setShowEditDatabase(false);
      setEditingDatabaseId(null);
    }
  }

  async function handleConfirmDeleteDatabase() {
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
  }

  async function handleToggleContainer(db: Database) {
    const result = await toggleContainerState(db);
    if (!result.ok) {
      window.alert(result.error);
    }
  }

  async function handleCopyConnectionString(db: Database) {
    const connectionString = buildConnectionString(db);
    try {
      await navigator.clipboard.writeText(connectionString);
    } catch {
      window.prompt("Copy connection string:", connectionString);
    }
  }

  return (
    <SidebarProvider defaultOpen className="h-full">
      <AppSidebar
        categories={categories}
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
        onCreateCategory={() => setShowCreateCategory(true)}
        onCreateDatabase={() => {
          setCreateError(null);
          setShowCreateDatabase(true);
        }}
        onOpenSettings={() => setShowSettings(true)}
      />

      <SidebarInset className="flex flex-col overflow-hidden">
        {showEngineWarning && (
          <EngineWarningBanner engineLabel={engineLabel} onRetry={retryEngineCheck} />
        )}
        {!engineChecking && engineStatus?.running && <div className="hidden" />}

        <main className="flex flex-1 flex-col items-center gap-3 text-center overflow-auto">
          {visibleDatabases.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <DatabaseIcon className="size-10 stroke-[1.25]" />
              <p className="text-sm font-medium text-foreground/80">
                No Databases
              </p>
              <p className="text-xs text-muted-foreground">
                {selectedCategory === null
                  ? "Get started by creating a new database."
                  : `No databases in \"${selectedCategoryName}\" yet.`}
              </p>
            </div>
          ) : (
            <div className="w-full grid grid-cols-1 gap-3">
              {visibleDatabases.map((db) => (
                <DatabaseCard
                  key={db.id}
                  db={db}
                  categories={categories}
                  runtime={runtimeByDbId[db.id]}
                  actionBusy={actionBusyByDbId[db.id] ?? false}
                  isCreating={creatingByDbId[db.id] ?? false}
                  engineRunning={engineStatus?.running ?? false}
                  onToggleRunning={() => void handleToggleContainer(db)}
                  onEdit={() => {
                    setCreateError(null);
                    setEditingDatabaseId(db.id);
                    setShowEditDatabase(true);
                  }}
                  onDelete={() => {
                    setDeleteError(null);
                    setPendingDeleteDatabaseId(db.id);
                  }}
                  onCopyConnectionString={() =>
                    void handleCopyConnectionString(db)
                  }
                />
              ))}
            </div>
          )}
        </main>
      </SidebarInset>

      <CreateCategoryDialog
        open={showCreateCategory}
        onOpenChange={setShowCreateCategory}
        onSave={handleCreateCategory}
      />

      <CreateDatabaseDialog
        open={showCreateDatabase}
        onOpenChange={(open) => {
          if (!open) setCreateError(null);
          setShowCreateDatabase(open);
        }}
        categories={categories}
        existingDatabases={databases.filter(
          (db) => (db.engine ?? selectedEngine) === selectedEngine,
        )}
        onSave={handleCreateDatabase}
        isCreating={false}
        createError={createError}
        engineRunning={engineStatus?.running ?? false}
        engineLabel={engineLabel}
      />

      <CreateDatabaseDialog
        open={showEditDatabase}
        onOpenChange={(open) => {
          setShowEditDatabase(open);
          if (!open) setEditingDatabaseId(null);
        }}
        categories={categories}
        existingDatabases={databases.filter(
          (db) => (db.engine ?? selectedEngine) === selectedEngine,
        )}
        onSave={handleEditDatabase}
        mode="edit"
        initialDatabase={
          editingDatabase
            ? {
                name: editingDatabase.name,
                service: editingDatabase.service,
                version: editingDatabase.version,
                port: editingDatabase.port,
                password: editingDatabase.password,
                categoryIds: editingDatabase.categoryIds,
              }
            : null
        }
        engineRunning={engineStatus?.running ?? false}
        engineLabel={engineLabel}
      />

      <DeleteDatabaseDialog
        engineLabel={engineLabel}
        open={pendingDeleteDatabaseId !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) {
            setPendingDeleteDatabaseId(null);
            setDeleteError(null);
          }
        }}
        deleting={deleting}
        error={deleteError}
        onConfirm={() => void handleConfirmDeleteDatabase()}
      />

      <SettingsDialog
        open={showSettings}
        onOpenChange={setShowSettings}
        currentEngine={selectedEngine}
        currentVersion={currentVersion}
        updaterStatus={updaterStatus}
        updaterError={updaterError}
        availableVersion={availableVersion}
        updateNotes={updateNotes}
        updateProgressPercent={updateProgressPercent}
        onCheckForUpdates={checkForUpdates}
        onInstallUpdate={installUpdate}
        onSave={(engine) => {
          setContainerEngine(engine);
        }}
      />
    </SidebarProvider>
  );
}
