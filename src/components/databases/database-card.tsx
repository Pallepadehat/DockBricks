import {
  CopyIcon,
  Loader2Icon,
  PencilIcon,
  PlayIcon,
  SquareIcon,
  Trash2Icon,
} from "lucide-react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Button } from "@/components/ui/button";
import type { Category, Database } from "@/types/models";
import type { RuntimeState } from "@/hooks/use-database-runtime";

type DatabaseCardProps = {
  db: Database;
  categories: Category[];
  runtime?: RuntimeState;
  actionBusy: boolean;
  engineRunning: boolean;
  onToggleRunning: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCopyConnectionString: () => void;
};

export function DatabaseCard({
  db,
  categories,
  runtime,
  actionBusy,
  engineRunning,
  onToggleRunning,
  onEdit,
  onDelete,
  onCopyConnectionString,
}: DatabaseCardProps) {
  const dbCategories = categories.filter((c) => db.categoryIds.includes(c.id));

  const serviceColor: Record<string, string> = {
    MariaDB: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    MySQL:
      "bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
    PostgreSQL: "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
    Redis: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  };

  const status = !engineRunning
    ? { label: "Engine Offline", className: "text-muted-foreground" }
    : runtime?.loading
      ? { label: "Checking", className: "text-muted-foreground" }
      : runtime?.exists === false
        ? { label: "Missing", className: "text-amber-600" }
        : runtime?.running
          ? { label: "Running", className: "text-emerald-600" }
          : { label: "Stopped", className: "text-red-500" };

  const disableToggle =
    !engineRunning ||
    actionBusy ||
    runtime?.loading ||
    runtime?.exists === false ||
    !runtime;

  const isRunning = runtime?.running ?? false;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="flex flex-col border-b p-4 text-left transition-colors hover:bg-secondary/30">
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium leading-none">{db.name}</p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-sm ${status.className}`}>
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

          <div className="flex items-center gap-1">
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
