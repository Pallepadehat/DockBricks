import "./App.css";
import * as React from "react";
import {
  AlertTriangleIcon,
  CopyIcon,
  DatabaseIcon,
  Loader2Icon,
  PencilIcon,
  PlayIcon,
  RefreshCwIcon,
  SquareIcon,
  Trash2Icon,
} from "lucide-react";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar, type Category } from "@/components/app-sidebar";
import { CreateCategoryDialog } from "@/components/create-category-dialog";
import {
  CreateDatabaseDialog,
  type Database,
} from "@/components/create-database-dialog";
import {
  checkDocker,
  createDatabase,
  deleteContainer,
  inspectContainer,
  startContainer,
  stopContainer,
  type DockerStatus,
} from "@/lib/tauri-commands";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

type RuntimeState = {
  exists: boolean;
  running: boolean;
  loading: boolean;
  error: string | null;
};

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

function containerTargetFor(db: Database): string {
  if (db.containerId) return db.containerId;
  return `dockbricks-${db.name.toLowerCase().replace(/\s+/g, "-")}`;
}

export default function App() {
  const [categories, setCategories] = React.useState<Category[]>(() =>
    loadFromStorage("dockbricks_categories", []),
  );
  const [databases, setDatabases] = React.useState<Database[]>(() =>
    loadFromStorage("dockbricks_databases", []),
  );
  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(
    null,
  );

  const [showCreateCategory, setShowCreateCategory] = React.useState(false);
  const [showCreateDatabase, setShowCreateDatabase] = React.useState(false);
  const [showEditDatabase, setShowEditDatabase] = React.useState(false);
  const [editingDatabaseId, setEditingDatabaseId] = React.useState<
    string | null
  >(null);

  const [pendingDeleteDatabaseId, setPendingDeleteDatabaseId] = React.useState<
    string | null
  >(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const [dockerStatus, setDockerStatus] = React.useState<DockerStatus | null>(
    null,
  );
  const [dockerChecking, setDockerChecking] = React.useState(true);
  const [dockerBannerDismissed, setDockerBannerDismissed] =
    React.useState(false);

  const [isCreating, setIsCreating] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);

  const [runtimeByDbId, setRuntimeByDbId] = React.useState<
    Record<string, RuntimeState>
  >({});
  const [runtimeActionByDbId, setRuntimeActionByDbId] = React.useState<
    Record<string, boolean>
  >({});

  React.useEffect(() => {
    saveToStorage("dockbricks_categories", categories);
  }, [categories]);

  React.useEffect(() => {
    saveToStorage("dockbricks_databases", databases);
  }, [databases]);

  const pollDocker = React.useCallback(async () => {
    setDockerChecking(true);
    try {
      const status = await checkDocker();
      setDockerStatus(status);
      if (status.running) setDockerBannerDismissed(false);
    } catch (e) {
      setDockerStatus({ running: false, version: null, error: String(e) });
    } finally {
      setDockerChecking(false);
    }
  }, []);

  React.useEffect(() => {
    void pollDocker();
    const timer = setInterval(() => {
      void pollDocker();
    }, 10_000);
    return () => clearInterval(timer);
  }, [pollDocker]);

  const refreshContainerState = React.useCallback(
    async (db: Database) => {
      if (!dockerStatus?.running) {
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
      } catch (e) {
        setRuntimeByDbId((prev) => ({
          ...prev,
          [db.id]: {
            exists: false,
            running: false,
            loading: false,
            error: String(e),
          },
        }));
      }
    },
    [dockerStatus?.running],
  );

  React.useEffect(() => {
    if (!dockerStatus?.running || databases.length === 0) {
      setRuntimeByDbId({});
      return;
    }

    void Promise.all(databases.map((db) => refreshContainerState(db)));

    const timer = setInterval(() => {
      void Promise.all(databases.map((db) => refreshContainerState(db)));
    }, 10_000);

    return () => clearInterval(timer);
  }, [databases, dockerStatus?.running, refreshContainerState]);

  function handleCreateCategory(name: string) {
    const newCat: Category = { id: crypto.randomUUID(), name };
    setCategories((prev) => [...prev, newCat]);
  }

  async function handleCreateDatabase(
    data: Omit<Database, "id" | "containerId">,
  ) {
    setIsCreating(true);
    setCreateError(null);
    try {
      const result = await createDatabase({
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

      const newDb: Database = {
        id: crypto.randomUUID(),
        containerId: result.container_id ?? undefined,
        ...data,
      };
      setDatabases((prev) => [...prev, newDb]);
      setShowCreateDatabase(false);
      void refreshContainerState(newDb);
    } catch (e) {
      setCreateError(String(e));
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
    setRuntimeByDbId((prev) => {
      const next = { ...prev };
      delete next[databaseId];
      return next;
    });
    setRuntimeActionByDbId((prev) => {
      const next = { ...prev };
      delete next[databaseId];
      return next;
    });

    if (editingDatabaseId === databaseId) {
      setShowEditDatabase(false);
      setEditingDatabaseId(null);
    }
  }

  async function confirmDeleteDatabase() {
    if (!pendingDeleteDatabaseId) return;

    const db = databases.find((item) => item.id === pendingDeleteDatabaseId);
    if (!db) {
      setPendingDeleteDatabaseId(null);
      return;
    }

    if (!dockerStatus?.running) {
      setDeleteError("Docker is not running. Start Docker and try again.");
      return;
    }

    setDeleting(true);
    setDeleteError(null);
    try {
      const result = await deleteContainer(containerTargetFor(db));
      if (!result.success && !result.not_found) {
        setDeleteError(result.error ?? "Failed to delete container.");
        return;
      }

      handleDeleteDatabaseLocal(db.id);
      setPendingDeleteDatabaseId(null);
    } catch (e) {
      setDeleteError(String(e));
    } finally {
      setDeleting(false);
    }
  }

  async function handleToggleContainer(db: Database) {
    if (!dockerStatus?.running) {
      window.alert("Docker is not running.");
      return;
    }

    const runtime = runtimeByDbId[db.id];
    if (!runtime || runtime.loading || !runtime.exists) {
      window.alert("Container was not found for this database.");
      return;
    }

    const target = containerTargetFor(db);

    setRuntimeActionByDbId((prev) => ({ ...prev, [db.id]: true }));
    try {
      const result = runtime.running
        ? await stopContainer(target)
        : await startContainer(target);

      if (!result.success) {
        window.alert(result.error ?? "Failed to change container state.");
        return;
      }
    } catch (e) {
      window.alert(String(e));
    } finally {
      setRuntimeActionByDbId((prev) => ({ ...prev, [db.id]: false }));
      void refreshContainerState(db);
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

  const showDockerWarning =
    !dockerChecking &&
    dockerStatus !== null &&
    !dockerStatus.running &&
    !dockerBannerDismissed;

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
      />

      <SidebarInset className="flex flex-col overflow-hidden">
        {showDockerWarning && (
          <DockerWarningBanner
            onRetry={pollDocker}
            onDismiss={() => setDockerBannerDismissed(true)}
          />
        )}

        {!dockerChecking && dockerStatus?.running && <div className="hidden" />}

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
                  actionBusy={runtimeActionByDbId[db.id] ?? false}
                  dockerRunning={dockerStatus?.running ?? false}
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
        dockerRunning={dockerStatus?.running ?? false}
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
        dockerRunning={dockerStatus?.running ?? false}
      />

      <AlertDialog
        open={pendingDeleteDatabaseId !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) {
            setPendingDeleteDatabaseId(null);
            setDeleteError(null);
          }
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Database?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the local entry and deletes the Docker container.
            </AlertDialogDescription>
            {deleteError && (
              <p className="text-xs text-destructive">{deleteError}</p>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(event) => {
                event.preventDefault();
                if (deleting) return;
                void confirmDeleteDatabase();
              }}
            >
              {deleting ? (
                <>
                  <Loader2Icon className="size-4 animate-spin" />
                  Deleting…
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
}

function DockerWarningBanner({
  onRetry,
}: {
  onRetry: () => void;
  error?: string | null;
  onDismiss?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-destructive/20 bg-destructive/10 px-4 py-3 text-sm">
      <AlertTriangleIcon className="size-4 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-destructive">Docker is not running</p>
      </div>
      <div className="shrink-0">
        <button
          onClick={onRetry}
          className="flex items-center gap-1.5 text-xs text-destructive/80 transition-colors hover:text-destructive"
        >
          <RefreshCwIcon className="size-3" />
          Retry
        </button>
      </div>
    </div>
  );
}

function DatabaseCard({
  db,
  categories,
  runtime,
  actionBusy,
  dockerRunning,
  onToggleRunning,
  onEdit,
  onDelete,
  onCopyConnectionString,
}: {
  db: Database;
  categories: Category[];
  runtime?: RuntimeState;
  actionBusy: boolean;
  dockerRunning: boolean;
  onToggleRunning: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCopyConnectionString: () => void;
}) {
  const dbCategories = categories.filter((c) => db.categoryIds.includes(c.id));

  const serviceColor: Record<string, string> = {
    MariaDB: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    MySQL:
      "bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
    PostgreSQL: "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
    Redis: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  };

  const status = !dockerRunning
    ? { label: "Docker Offline", className: "text-muted-foreground" }
    : runtime?.loading
      ? { label: "Checking", className: "text-muted-foreground" }
      : runtime?.exists === false
        ? { label: "Missing", className: "text-amber-600" }
        : runtime?.running
          ? { label: "Running", className: "text-emerald-600" }
          : { label: "Stopped", className: "text-red-500" };

  const disableToggle =
    !dockerRunning ||
    actionBusy ||
    runtime?.loading ||
    runtime?.exists === false ||
    !runtime;

  const isRunning = runtime?.running ?? false;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="flex flex-col gap-2 border-b p-4 text-left transition-colors hover:bg-secondary/30">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium leading-none">{db.name}</p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-sm font-semibold ${status.className}`}>
                {status.label}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleRunning();
                }}
                disabled={disableToggle}
                aria-label={isRunning ? "Stop container" : "Start container"}
                title={isRunning ? "Stop container" : "Start container"}
              >
                {actionBusy ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : isRunning ? (
                  <SquareIcon className="size-4" />
                ) : (
                  <PlayIcon className="size-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span
              className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                serviceColor[db.service] ?? "bg-muted text-muted-foreground"
              }`}
            >
              {db.service} {db.version}
            </span>
            <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              :{db.port}
            </span>
          </div>

          {dbCategories.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {dbCategories.map((cat) => (
                <span
                  key={cat.id}
                  className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
                >
                  {cat.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-56">
        <ContextMenuItem onSelect={onCopyConnectionString}>
          <CopyIcon className="size-4" />
          Copy Connection String
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={onEdit}>
          <PencilIcon className="size-4" />
          Edit Database
        </ContextMenuItem>
        <ContextMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2Icon className="size-4" />
          Delete Database
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function buildConnectionString(db: Database): string {
  const host = "localhost";
  const port = db.port;
  const database = encodeURIComponent(db.name);
  const password = resolveConnectionPassword(db);

  switch (db.service) {
    case "MariaDB":
    case "MySQL":
      return password
        ? `mysql://root:${encodeURIComponent(password)}@${host}:${port}/${database}`
        : `mysql://root@${host}:${port}/${database}`;
    case "PostgreSQL":
      return password
        ? `postgresql://postgres:${encodeURIComponent(password)}@${host}:${port}/${database}`
        : `postgresql://postgres@${host}:${port}/${database}`;
    case "Redis":
      return password
        ? `redis://:${encodeURIComponent(password)}@${host}:${port}`
        : `redis://${host}:${port}`;
  }
}

function resolveConnectionPassword(db: Database): string {
  if (db.password) return db.password;

  if (db.service === "PostgreSQL") {
    return "postgres";
  }

  return "";
}

function humanizeCreateError(
  error: string | null | undefined,
  port: string,
): string {
  if (!error) return "Unknown error";

  if (
    error.includes("port is already allocated") ||
    error.includes("Bind for 0.0.0.0")
  ) {
    const numericPort = Number(port);
    const nextPort = Number.isFinite(numericPort) ? numericPort + 1 : "another";
    return `Port ${port} is already in use on your machine. Choose another host port like ${nextPort}, or stop the service that is already using it.`;
  }

  return error;
}
