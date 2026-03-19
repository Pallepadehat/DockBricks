import "./App.css";
import * as React from "react";
import {
  DatabaseIcon,
  AlertTriangleIcon,
  RefreshCwIcon,
  CopyIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";

import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar, type Category } from "@/components/app-sidebar";
import { CreateCategoryDialog } from "@/components/create-category-dialog";
import {
  CreateDatabaseDialog,
  type Database,
} from "@/components/create-database-dialog";
import {
  checkDocker,
  createDatabase,
  type DockerStatus,
} from "@/lib/tauri-commands";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

// ── localStorage helpers ──────────────────────────────────────────────────────
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

// ── Main App ──────────────────────────────────────────────────────────────────
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

  // Docker status
  const [dockerStatus, setDockerStatus] = React.useState<DockerStatus | null>(
    null,
  );
  const [dockerChecking, setDockerChecking] = React.useState(true);
  const [dockerBannerDismissed, setDockerBannerDismissed] =
    React.useState(false);

  // Creating state for the dialog
  const [isCreating, setIsCreating] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);

  // Persist to localStorage
  React.useEffect(() => {
    saveToStorage("dockbricks_categories", categories);
  }, [categories]);

  React.useEffect(() => {
    saveToStorage("dockbricks_databases", databases);
  }, [databases]);

  // ── Docker health check ──
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

  // Check on mount, then every 10 seconds
  React.useEffect(() => {
    pollDocker();
    const timer = setInterval(pollDocker, 10_000);
    return () => clearInterval(timer);
  }, [pollDocker]);

  // ── Handlers ──
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

  function handleDeleteDatabase(databaseId: string) {
    setDatabases((prev) => prev.filter((db) => db.id !== databaseId));
    if (editingDatabaseId === databaseId) {
      setShowEditDatabase(false);
      setEditingDatabaseId(null);
    }
  }

  async function handleCopyConnectionString(db: Database) {
    const connectionString = buildConnectionString(db);
    try {
      await navigator.clipboard.writeText(connectionString);
    } catch {
      // Clipboard can fail in restricted environments, so we still expose the value.
      window.prompt("Copy connection string:", connectionString);
    }
  }

  const editingDatabase =
    editingDatabaseId === null
      ? null
      : (databases.find((db) => db.id === editingDatabaseId) ?? null);

  // Filter databases by selected category
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
        {/* ── Docker status banner ── */}
        {showDockerWarning && (
          <DockerWarningBanner
            error={dockerStatus?.error ?? null}
            onRetry={pollDocker}
            onDismiss={() => setDockerBannerDismissed(true)}
          />
        )}

        {/* ── Docker OK toast (briefly shown when it comes back online) ── */}
        {!dockerChecking && dockerStatus?.running && <div className="hidden" />}

        {/* ── Main content ── */}
        <main className="flex flex-1 flex-col items-center gap-3 text-center px-2 overflow-auto">
          {visibleDatabases.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
              <DatabaseIcon className="size-10 stroke-[1.25]" />
              <p className="text-sm font-medium text-foreground/80">
                No Databases
              </p>
              <p className="text-xs text-muted-foreground">
                {selectedCategory === null
                  ? "Get started by creating a new database."
                  : `No databases in "${selectedCategoryName}" yet.`}
              </p>
            </div>
          ) : (
            <div className="w-full grid grid-cols-1 gap-3">
              {visibleDatabases.map((db) => (
                <DatabaseCard
                  key={db.id}
                  db={db}
                  categories={categories}
                  onEdit={() => {
                    setCreateError(null);
                    setEditingDatabaseId(db.id);
                    setShowEditDatabase(true);
                  }}
                  onDelete={() => {
                    const confirmed = window.confirm(
                      `Delete "${db.name}" from DockBricks?`,
                    );
                    if (!confirmed) return;
                    handleDeleteDatabase(db.id);
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

      {/* Dialogs */}
      <CreateCategoryDialog
        open={showCreateCategory}
        onOpenChange={setShowCreateCategory}
        onSave={handleCreateCategory}
      />
      <CreateDatabaseDialog
        open={showCreateDatabase}
        onOpenChange={(o) => {
          if (!o) setCreateError(null);
          setShowCreateDatabase(o);
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
    </SidebarProvider>
  );
}

// ── Docker warning banner ─────────────────────────────────────────────────────
function DockerWarningBanner({
  onRetry,
}: {
  onRetry: () => void;
  error?: string | null;
  onDismiss?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 bg-destructive/10 border-b border-destructive/20 text-sm">
      <AlertTriangleIcon className="size-4 mt-0.5 shrink-0 text-destructive" />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-destructive">Docker is not running</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onRetry}
          className="flex items-center gap-1.5 text-xs text-destructive/80 hover:text-destructive transition-colors"
        >
          <RefreshCwIcon className="size-3" />
          Retry
        </button>
      </div>
    </div>
  );
}

// ── Database card ─────────────────────────────────────────────────────────────
function DatabaseCard({
  db,
  categories,
  onEdit,
  onDelete,
  onCopyConnectionString,
}: {
  db: Database;
  categories: Category[];
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

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="rounded-lg border bg-card p-4 text-left shadow-xs flex flex-col gap-2 hover:shadow-sm transition-shadow">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium leading-none">{db.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
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
          </div>

          {dbCategories.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1">
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
      <ContextMenuContent className="w-48">
        <ContextMenuItem onSelect={onCopyConnectionString} className="text-xs">
          <CopyIcon className="size-4" />
          Copy Connection String
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={onEdit} className="text-xs">
          <PencilIcon className="size-4" />
          Edit Database
        </ContextMenuItem>
        <ContextMenuItem
          variant="destructive"
          onSelect={onDelete}
          className="text-xs "
        >
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
  const password = encodeURIComponent(db.password);

  switch (db.service) {
    case "MariaDB":
    case "MySQL":
      return `mysql://root:${password}@${host}:${port}/${database}`;
    case "PostgreSQL":
      return `postgresql://postgres:${password}@${host}:${port}/${database}`;
    case "Redis":
      return password
        ? `redis://:${password}@${host}:${port}`
        : `redis://${host}:${port}`;
  }
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
