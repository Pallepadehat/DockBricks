import * as React from "react";
import {
  Clock3Icon,
  CopyIcon,
  CpuIcon,
  HardDriveIcon,
  Loader2Icon,
  MemoryStickIcon,
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ServiceIcon } from "@/components/databases/service-icon";
import type { Database, ServiceName } from "@/types/models";
import type { RuntimeState } from "@/hooks/use-database-runtime";

type DatabaseCardProps = {
  db: Database;
  categoryNames: string[];
  runtime?: RuntimeState;
  actionBusy: boolean;
  isCreating: boolean;
  engineRunning: boolean;
  onToggleRunning: (databaseId: string) => void;
  onEdit: (databaseId: string) => void;
  onDelete: (databaseId: string) => void;
  onCopyConnectionString: (databaseId: string) => void;
};

const SERVICE_COLOR: Record<ServiceName, string> = {
  MariaDB: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  MySQL: "bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  PostgreSQL: "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  Redis: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
};

function parseMetric(value: string): { amount: number; suffix: string; decimals: number } | null {
  const match = value.match(/^([\d.]+)\s*(.*)$/);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  const suffix = match[2]?.trim() ?? "";
  return {
    amount,
    suffix: suffix ? `${suffix === "%" ? "" : " "}${suffix}` : "",
    decimals: match[1].includes(".") ? 1 : 0,
  };
}

function AnimatedUsageValue({ value }: { value: string }) {
  const metric = React.useMemo(() => parseMetric(value), [value]);
  const [displayValue, setDisplayValue] = React.useState(value);
  const previousMetric = React.useRef(metric);

  React.useEffect(() => {
    if (!metric) {
      setDisplayValue(value);
      previousMetric.current = metric;
      return;
    }

    const previous = previousMetric.current;
    previousMetric.current = metric;

    if (!previous || previous.suffix !== metric.suffix) {
      setDisplayValue(value);
      return;
    }

    const start = previous.amount;
    const end = metric.amount;
    const startedAt = performance.now();
    const duration = 520;
    let frame = 0;

    const tick = (now: number) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = start + (end - start) * eased;
      setDisplayValue(`${next.toFixed(metric.decimals)}${metric.suffix}`);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [metric, value]);

  return <span>{displayValue}</span>;
}

export const DatabaseCard = React.memo(function DatabaseCard({
  db,
  categoryNames,
  runtime,
  actionBusy,
  isCreating,
  engineRunning,
  onToggleRunning,
  onEdit,
  onDelete,
  onCopyConnectionString,
}: DatabaseCardProps) {
  const status = isCreating
    ? { label: "Creating", className: "text-sky-600" }
    : !engineRunning
    ? { label: "Engine Offline", className: "text-muted-foreground" }
    : runtime?.loading
      ? { label: "Checking", className: "text-muted-foreground" }
      : runtime?.exists === false
        ? { label: "Missing", className: "text-amber-600" }
        : runtime?.running
          ? { label: "Running", className: "text-emerald-600" }
          : { label: "Stopped", className: "text-red-500" };

  const disableToggle =
    isCreating ||
    !engineRunning ||
    actionBusy ||
    runtime?.loading ||
    runtime?.exists === false;

  const isRunning = runtime?.running ?? false;
  const usage = runtime?.usage;
  const usageItems = [
    { label: "CPU", value: usage?.cpu_percent ?? (isRunning ? "—" : "0%"), icon: CpuIcon },
    { label: "Memory", value: usage?.memory ?? (isRunning ? "—" : "0 B"), icon: MemoryStickIcon },
    { label: "Storage", value: usage?.storage ?? "—", icon: HardDriveIcon },
  ];

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="flex flex-col border-b p-4 text-left transition-colors hover:bg-secondary/30">
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium leading-none">{db.name}</p>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <div className="flex items-center gap-2">
                <span className={`text-sm ${status.className}`}>
                  {status.label}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleRunning(db.id);
                  }}
                  disabled={disableToggle}
                  aria-label={isRunning ? "Stop container" : "Start container"}
                  title={isRunning ? "Stop container" : "Start container"}
                >
                  {isCreating ? (
                    <Clock3Icon className="size-4" />
                  ) : actionBusy ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : isRunning ? (
                    <SquareIcon className="size-4" />
                  ) : (
                    <PlayIcon className="size-4" />
                  )}
                </Button>
              </div>

            </div>
          </div>

          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-1">
              <span
                className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${
                  SERVICE_COLOR[db.service] ?? "bg-muted text-muted-foreground"
                }`}
              >
                <ServiceIcon service={db.service} className="size-3.5" />
                {db.service} {db.version}
              </span>
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                :{db.port}
              </span>
            </div>

            <TooltipProvider delayDuration={120}>
              <div className="flex shrink-0 items-center gap-2 text-muted-foreground">
                {usageItems.map(({ label, value, icon: Icon }) => (
                  <Tooltip key={label}>
                    <TooltipTrigger asChild>
                      <span
                        className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-[11px] tabular-nums transition-colors hover:bg-muted hover:text-foreground"
                        aria-label={`${label}: ${value}`}
                      >
                        <Icon className="size-3" />
                        <AnimatedUsageValue value={value} />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" sideOffset={6}>
                      {label} usage
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </TooltipProvider>
          </div>


          {categoryNames.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {categoryNames.map((categoryName) => (
                <span
                  key={categoryName}
                  className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
                >
                  {categoryName}
                </span>
              ))}
            </div>
          )}
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-56">
        <ContextMenuItem onSelect={() => onCopyConnectionString(db.id)}>
          <CopyIcon className="size-4" />
          Copy Connection String
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => onEdit(db.id)} disabled={isCreating}>
          <PencilIcon className="size-4" />
          Edit Database
        </ContextMenuItem>
        <ContextMenuItem
          variant="destructive"
          onSelect={() => onDelete(db.id)}
          disabled={isCreating}
        >
          <Trash2Icon className="size-4" />
          Delete Database
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});
