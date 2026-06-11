import "./App.css";
import * as React from "react";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { CreateCategoryDialog } from "@/components/create-category-dialog";
import { CreateDatabaseDialog } from "@/components/create-database-dialog";
import { ImportComposeDialog } from "@/components/import-compose-dialog";
import { DeleteDatabaseDialog } from "@/components/dialogs/delete-database-dialog";
import { SettingsDialog } from "@/components/dialogs/settings-dialog";
import { EngineWarningBanner } from "@/components/engine-warning-banner";
import { EngineOnboarding } from "@/components/onboarding/engine-onboarding";
import {
  getCategoryNameById,
  getEngineDatabases,
  getSelectedCategoryName,
  getVisibleDatabases,
} from "@/features/databases/database-selectors";
import { DatabaseList } from "@/features/databases/database-list";
import { useDatabaseActions } from "@/features/databases/use-database-actions";
import { useAppUpdater } from "@/hooks/use-app-updater";
import { useDatabaseRuntime } from "@/hooks/use-database-runtime";
import { useContainerEngineHealth } from "@/hooks/use-container-engine-health";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { useSecureDatabases } from "@/hooks/use-secure-databases";
import type { Category, ContainerEngine } from "@/types/models";

export default function App() {
  const [categories, setCategories] = usePersistentState<Category[]>(
    "dockbricks_categories",
    [],
  );
  const { databases, setDatabases, useKeychain, setUseKeychain, passwordsReady } =
    useSecureDatabases();
  const [containerEngine, setContainerEngine] = usePersistentState<ContainerEngine | null>(
    "dockbricks_container_engine",
    null,
  );
  const [autoSwitchPorts, setAutoSwitchPorts] = usePersistentState<boolean>(
    "dockbricks_auto_switch_ports",
    true,
  );

  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(
    null,
  );
  const [showCreateCategory, setShowCreateCategory] = React.useState(false);
  const [showCreateDatabase, setShowCreateDatabase] = React.useState(false);
  const [showImportCompose, setShowImportCompose] = React.useState(false);
  const [showSettings, setShowSettings] = React.useState(false);
  const [showEditDatabase, setShowEditDatabase] = React.useState(false);
  const [editingDatabaseId, setEditingDatabaseId] = React.useState<
    string | null
  >(null);

  const selectedEngine: ContainerEngine = containerEngine ?? "docker";
  const engineLabel = selectedEngine === "docker" ? "Docker" : "Podman";
  const engineDatabases = React.useMemo(
    () => getEngineDatabases(databases, selectedEngine),
    [databases, selectedEngine],
  );
  const visibleDatabases = React.useMemo(
    () => getVisibleDatabases(databases, selectedEngine, selectedCategory),
    [databases, selectedCategory, selectedEngine],
  );
  const categoryNameById = React.useMemo(
    () => getCategoryNameById(categories),
    [categories],
  );
  const selectedCategoryName = React.useMemo(
    () => getSelectedCategoryName(categories, selectedCategory),
    [categories, selectedCategory],
  );

  const updater = useAppUpdater(passwordsReady);
  const { engineStatus, showEngineWarning, retryEngineCheck } =
    useContainerEngineHealth(selectedEngine);

  const {
    runtimeByDbId,
    actionBusyByDbId,
    refreshContainerState,
    toggleContainerState,
    deleteContainerForDatabase,
    clearRuntimeForDatabase,
  } = useDatabaseRuntime(engineDatabases, selectedEngine, engineStatus?.running ?? false);

  const {
    creatingByDbId,
    createError,
    setCreateError,
    deleting,
    deleteError,
    setDeleteError,
    pendingDeleteDatabaseId,
    setPendingDeleteDatabaseId,
    handleCreateDatabase,
    handleImportDatabases,
    handleEditDatabase,
    handleConfirmDeleteDatabase,
    handleToggleContainer,
    handleCopyConnectionString,
    requestEditDatabase,
    requestDeleteDatabase,
  } = useDatabaseActions({
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
  });

  const editingDatabase =
    editingDatabaseId === null
      ? null
      : (databases.find((db) => db.id === editingDatabaseId) ?? null);

  const handleToggleDatabase = React.useCallback(
    (databaseId: string) => {
      void handleToggleContainer(databaseId);
    },
    [handleToggleContainer],
  );

  const handleCopyDatabaseConnectionString = React.useCallback(
    (databaseId: string) => {
      void handleCopyConnectionString(databaseId);
    },
    [handleCopyConnectionString],
  );

  if (!containerEngine) {
    return <EngineOnboarding onSelectEngine={setContainerEngine} />;
  }

  if (!passwordsReady) {
    return null;
  }

  function handleCreateCategory(name: string) {
    const newCategory: Category = { id: crypto.randomUUID(), name };
    setCategories((prev) => [...prev, newCategory]);
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
        onImportCompose={() => setShowImportCompose(true)}
        onOpenSettings={() => setShowSettings(true)}
        updateAvailable={updater.status === "available" || updater.status === "ready"}
      />

      <SidebarInset className="flex flex-col overflow-hidden">
        {showEngineWarning && (
          <EngineWarningBanner engineLabel={engineLabel} onRetry={retryEngineCheck} />
        )}

        <main className="flex flex-1 flex-col items-center gap-3 text-center overflow-auto">
          <DatabaseList
            databases={visibleDatabases}
            selectedCategory={selectedCategory}
            selectedCategoryName={selectedCategoryName}
            categoryNameById={categoryNameById}
            runtimeByDbId={runtimeByDbId}
            actionBusyByDbId={actionBusyByDbId}
            creatingByDbId={creatingByDbId}
            engineRunning={engineStatus?.running ?? false}
            onToggleRunning={handleToggleDatabase}
            onEdit={requestEditDatabase}
            onDelete={requestDeleteDatabase}
            onCopyConnectionString={handleCopyDatabaseConnectionString}
          />
        </main>
      </SidebarInset>

      <CreateCategoryDialog
        open={showCreateCategory}
        onOpenChange={setShowCreateCategory}
        onSave={handleCreateCategory}
      />

      <ImportComposeDialog
        open={showImportCompose}
        onOpenChange={setShowImportCompose}
        categories={categories}
        selectedCategory={selectedCategory}
        existingDatabases={databases}
        defaultEngine={selectedEngine}
        onImport={handleImportDatabases}
      />

      <CreateDatabaseDialog
        open={showCreateDatabase}
        onOpenChange={(open) => {
          if (!open) setCreateError(null);
          setShowCreateDatabase(open);
        }}
        categories={categories}
        existingDatabases={databases}
        defaultEngine={selectedEngine}
        onSave={handleCreateDatabase}
        isCreating={false}
        createError={createError}
        engineRunning={engineStatus?.running ?? false}
        autoSwitchPorts={autoSwitchPorts}
      />

      <CreateDatabaseDialog
        open={showEditDatabase}
        onOpenChange={(open) => {
          setShowEditDatabase(open);
          if (!open) setEditingDatabaseId(null);
        }}
        categories={categories}
        existingDatabases={databases}
        defaultEngine={selectedEngine}
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
                engine: editingDatabase.engine ?? selectedEngine,
              }
            : null
        }
        engineRunning={engineStatus?.running ?? false}
        autoSwitchPorts={autoSwitchPorts}
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
        useKeychain={useKeychain}
        autoSwitchPorts={autoSwitchPorts}
        updater={updater}
        onSave={(engine, nextUseKeychain, nextAutoSwitchPorts) => {
          setContainerEngine(engine);
          setUseKeychain(nextUseKeychain);
          setAutoSwitchPorts(nextAutoSwitchPorts);
        }}
      />
    </SidebarProvider>
  );
}
