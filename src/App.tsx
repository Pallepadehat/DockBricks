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
  humanizeCreateError,
} from "@/lib/database-utils";
import { createDatabase } from "@/lib/tauri-commands";
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

  const [isCreating, setIsCreating] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  const selectedEngine: ContainerEngine = containerEngine ?? "docker";
  const engineLabel = selectedEngine === "docker" ? "Docker" : "Podman";

  const { engineStatus, engineChecking, showEngineWarning, retryEngineCheck } =
    useContainerEngineHealth(selectedEngine);

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
      ? databases
      : databases.filter((db) => db.categoryIds.includes(selectedCategory));

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
    setIsCreating(true);
    setCreateError(null);

    try {
      const result = await createDatabase({
        engine: selectedEngine,
        name: data.name,
        service: data.service,
        version: data.version,
        port: data.port,
        password: data.password,
      });

      if (!result.success) {
        setCreateError(humanizeCreateError(result.error, data.port));
        return;
      }

      const newDatabase: Database = {
        id: crypto.randomUUID(),
        containerId: result.container_id ?? undefined,
        ...data,
      };

      setDatabases((prev) => [...prev, newDatabase]);
      setShowCreateDatabase(false);
      void refreshContainerState(newDatabase);
    } catch (error) {
      setCreateError(String(error));
    } finally {
      setIsCreating(false);
    }
  }

  async function handleEditDatabase(
    data: Omit<Database, "id" | "containerId">,
  ) {
    if (!editingDatabaseId) return;

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
        existingDatabases={databases}
        onSave={handleCreateDatabase}
        isCreating={isCreating}
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
        existingDatabases={databases}
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
        onSave={(engine) => {
          setContainerEngine(engine);
        }}
      />
    </SidebarProvider>
  );
}
