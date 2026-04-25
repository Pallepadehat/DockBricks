import * as React from "react";
import {
  AlertCircleIcon,
  DatabaseIcon,
  EyeIcon,
  EyeOffIcon,
  FolderIcon,
  Loader2Icon,
  AlertTriangleIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Category, ContainerEngine, Database, ServiceName } from "@/types/models";
import {
  checkHostPort,
  fetchServiceVersions,
  type ServiceVersion,
} from "@/lib/tauri-commands";

// ── Service definitions ───────────────────────────────────────────────────────

const SERVICES = {
  MariaDB: {
    defaultPort: "3306",
    fallbackVersions: ["12.2", "11.8", "11.4", "10.11", "10.6", "10.5"],
  },
  MySQL: {
    defaultPort: "3306",
    fallbackVersions: ["9.6", "8.4", "8.0", "5.7"],
  },
  PostgreSQL: {
    defaultPort: "5432",
    fallbackVersions: ["18", "17", "16", "15", "14", "13"],
  },
  Redis: {
    defaultPort: "6379",
    fallbackVersions: ["8.6", "8.4", "8.2", "8.0", "7.4", "7.2", "7", "6.2"],
  },
} as const;

type VersionState = {
  options: ServiceVersion[];
  loading: boolean;
  error: string | null;
};

type PortState = {
  status: "idle" | "checking" | "available" | "unavailable" | "invalid";
  message: string | null;
};

const DEFAULT_VERSION_STATE: VersionState = {
  options: [],
  loading: false,
  error: null,
};

const DEFAULT_PORT_STATE: PortState = {
  status: "idle",
  message: null,
};

type CreateDatabaseDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  existingDatabases: Array<Pick<Database, "service" | "port">>;
  defaultEngine: ContainerEngine;
  onSave: (db: Omit<Database, "id" | "containerId">) => Promise<void>;
  mode?: "create" | "edit";
  initialDatabase?: Omit<Database, "id" | "containerId"> | null;
  isCreating?: boolean;
  createError?: string | null;
  engineRunning?: boolean;
};

// ── Component ─────────────────────────────────────────────────────────────────

export function CreateDatabaseDialog({
  open,
  onOpenChange,
  categories,
  existingDatabases,
  defaultEngine,
  onSave,
  mode = "create",
  initialDatabase = null,
  isCreating = false,
  createError = null,
  engineRunning = true,
}: CreateDatabaseDialogProps) {
  const [name, setName] = React.useState("");
  const [service, setService] = React.useState<ServiceName | "">("");
  const [version, setVersion] = React.useState("");
  const [port, setPort] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [selectedCategories, setSelectedCategories] = React.useState<string[]>(
    [],
  );
  const [versionStateByService, setVersionStateByService] = React.useState<
    Partial<Record<ServiceName, VersionState>>
  >({});
  const [portState, setPortState] = React.useState<PortState>(DEFAULT_PORT_STATE);

  const versionRequestId = React.useRef(0);
  const portRequestId = React.useRef(0);
  const wasOpen = React.useRef(false);

  const activeVersionState = service
    ? (versionStateByService[service] ?? DEFAULT_VERSION_STATE)
    : DEFAULT_VERSION_STATE;
  const versionOptions = React.useMemo(
    () =>
      service ? getVersionOptions(service, activeVersionState.options) : [],
    [activeVersionState.options, service],
  );
  const engineLabel = defaultEngine === "docker" ? "Docker" : "Podman";

  async function loadVersionsForService(
    svc: ServiceName,
    opts: { force?: boolean; preferLatest?: boolean } = {},
  ) {
    const currentState = versionStateByService[svc];
    if (
      !opts.force &&
      (currentState?.loading || currentState?.options.length)
    ) {
      if (opts.preferLatest && !version) {
        const latest = getVersionOptions(svc, currentState.options)[0];
        if (latest) setVersion(latest.tag);
      }
      return;
    }

    const requestId = ++versionRequestId.current;
    setVersionStateByService((prev) => ({
      ...prev,
      [svc]: {
        options: prev[svc]?.options ?? [],
        loading: true,
        error: null,
      },
    }));

    try {
      const fetched = await fetchServiceVersions(svc);
      if (versionRequestId.current !== requestId) return;

      const options = getVersionOptions(svc, fetched);
      setVersionStateByService((prev) => ({
        ...prev,
        [svc]: {
          options,
          loading: false,
          error: null,
        },
      }));

      if (opts.preferLatest) {
        setVersion((current) => current || options[0]?.tag || "");
      }
    } catch (error) {
      if (versionRequestId.current !== requestId) return;

      const fallback = getVersionOptions(svc, []);
      setVersionStateByService((prev) => ({
        ...prev,
        [svc]: {
          options: fallback,
          loading: false,
          error:
            "Couldn’t refresh versions from Docker Hub. Showing built-in options instead.",
        },
      }));

      if (opts.preferLatest) {
        setVersion((current) => current || fallback[0]?.tag || "");
      }

      console.error(`Failed to fetch versions for ${svc}:`, error);
    }
  }

  function handleServiceChange(value: string) {
    const svc = value as ServiceName;
    setService(svc);
    setVersion("");
    setPort(getSuggestedPort(svc, existingDatabases));
    void loadVersionsForService(svc, { preferLatest: true });
  }

  function toggleCategory(id: string) {
    setSelectedCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  }

  async function handleSave() {
    if (!name.trim() || !service || !version) return;
    if (portState.status === "checking") return;
    if (portState.status === "unavailable" || portState.status === "invalid") return;

    await onSave({
      name: name.trim(),
      service: service as ServiceName,
      version,
      port,
      password,
      categoryIds: selectedCategories,
      engine: defaultEngine,
    });
    // Dialog close and form reset happen in App.tsx on success
  }

  function resetForm() {
    setName("");
    setService("");
    setVersion("");
    setPort("");
    setPassword("");
    setShowPassword(false);
    setSelectedCategories([]);
    setPortState(DEFAULT_PORT_STATE);
  }

  React.useEffect(() => {
    if (open && !wasOpen.current) {
      if (mode === "edit" && initialDatabase) {
        setName(initialDatabase.name);
        setService(initialDatabase.service);
        setVersion(initialDatabase.version);
        setPort(initialDatabase.port);
        setPassword(initialDatabase.password);
        setShowPassword(false);
        setSelectedCategories(initialDatabase.categoryIds);
        void loadVersionsForService(initialDatabase.service);
      } else {
        resetForm();
      }
    }
    wasOpen.current = open;
  }, [defaultEngine, initialDatabase, mode, open]);

  React.useEffect(() => {
    if (!open || !port.trim()) {
      setPortState(DEFAULT_PORT_STATE);
      return;
    }

    if (mode === "edit" && initialDatabase?.port === port.trim()) {
      setPortState(DEFAULT_PORT_STATE);
      return;
    }

    if (!/^\d+$/.test(port.trim())) {
      setPortState({
        status: "invalid",
        message: "Use a numeric port.",
      });
      return;
    }

    const requestId = ++portRequestId.current;
    setPortState({
      status: "checking",
      message: "Checking port...",
    });

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        try {
          const status = await checkHostPort(defaultEngine, port.trim());
          if (portRequestId.current !== requestId) return;

          if (status.available) {
            setPortState({
              status: "available",
              message: null,
            });
          } else {
            const nextPort = getNextPortCandidate(port.trim(), existingDatabases);
            setPortState({
              status: "unavailable",
              message: `${status.error ?? `Port ${port.trim()} is in use.`} Try ${nextPort}.`,
            });
          }
        } catch (error) {
          if (portRequestId.current !== requestId) return;
          setPortState({
            status: "invalid",
            message: String(error),
          });
        }
      })();
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [defaultEngine, existingDatabases, initialDatabase?.port, mode, open, port]);

  const canSave =
    !isCreating &&
    name.trim() &&
    service &&
    version &&
    engineRunning &&
    portState.status !== "checking" &&
    portState.status !== "unavailable" &&
    portState.status !== "invalid";

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) resetForm();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md gap-5">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DatabaseIcon className="size-4 text-muted-foreground" />
            <DialogTitle>
              {mode === "edit" ? "Edit Database" : "Create Database"}
            </DialogTitle>
          </div>
        </DialogHeader>

        {!engineRunning && (
          <div className="flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
            <AlertTriangleIcon className="size-3.5 shrink-0" />
            <span>
              {engineLabel} is not running. Start {engineLabel} to create a
              database.
            </span>
          </div>
        )}

        {createError && (
          <div className="flex flex-col gap-0.5 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
            <span className="font-medium">
              {mode === "edit"
                ? "Failed to save database"
                : "Failed to create container"}
            </span>
            <span className="text-destructive/70 break-all">{createError}</span>
          </div>
        )}

        <div className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="db-name">Name</Label>
            <Input
              id="db-name"
              placeholder="My database"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              disabled={isCreating}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="db-service">Service</Label>
              <Select
                value={service}
                onValueChange={handleServiceChange}
                disabled={isCreating || mode === "edit"}
              >
                <SelectTrigger id="db-service" className="w-full">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(SERVICES).map((svc) => (
                    <SelectItem key={svc} value={svc}>
                      {svc}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {mode === "edit" && (
                <p className="text-xs text-muted-foreground">Locked.</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="db-version">Version</Label>
              <Select
                value={version}
                onValueChange={setVersion}
                disabled={!service || isCreating || activeVersionState.loading}
              >
                <SelectTrigger id="db-version" className="w-full">
                  <SelectValue
                    placeholder={
                      !service
                        ? "Select…"
                        : activeVersionState.loading
                          ? "Loading versions…"
                          : "Select…"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {service &&
                    versionOptions.map((option) => (
                      <SelectItem key={option.tag} value={option.tag}>
                        <div className="flex w-full items-center justify-between gap-2">
                          <span>{option.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {service && activeVersionState.error && (
                <div className="flex min-h-5 items-center gap-1.5 text-xs text-muted-foreground">
                  <AlertCircleIcon className="size-3" />
                  <span>Using built-in versions.</span>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="db-port">Port</Label>
              <Input
                id="db-port"
                placeholder="3306"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                disabled={isCreating}
                aria-invalid={
                  portState.status === "unavailable" || portState.status === "invalid"
                }
              />
              {portState.status === "checking" && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2Icon className="size-3 animate-spin" />
                  Checking port
                </p>
              )}
              {(portState.status === "unavailable" || portState.status === "invalid") &&
                portState.message && (
                  <p className="text-xs text-destructive">{portState.message}</p>
                )}
              {portState.status === "available" && (
                <p className="text-xs text-emerald-600">Port is free.</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="db-password">Password</Label>
              <div className="relative">
                <Input
                  id="db-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-9"
                  disabled={isCreating}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                  disabled={isCreating}
                >
                  {showPassword ? (
                    <EyeOffIcon className="size-4" />
                  ) : (
                    <EyeIcon className="size-4" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {categories.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label>Categories</Label>
              <div className="flex flex-col gap-1.5">
                {categories.map((cat) => (
                  <label
                    key={cat.id}
                    htmlFor={`cat-${cat.id}`}
                    className="flex items-center gap-2.5 cursor-pointer select-none"
                  >
                    <Checkbox
                      id={`cat-${cat.id}`}
                      checked={selectedCategories.includes(cat.id)}
                      onCheckedChange={() => toggleCategory(cat.id)}
                      disabled={isCreating}
                    />
                    <FolderIcon className="size-3.5 text-muted-foreground" />
                    <span className="text-sm">{cat.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              resetForm();
              onOpenChange(false);
            }}
            disabled={isCreating}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {isCreating ? (
              <>
                <Loader2Icon className="size-4 animate-spin" />
                {mode === "edit" ? "Saving…" : "Creating…"}
              </>
            ) : (
              mode === "edit" ? "Save Changes" : "Save"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getVersionOptions(
  service: ServiceName,
  fetchedOptions: ServiceVersion[],
): ServiceVersion[] {
  if (fetchedOptions.length > 0) {
    return fetchedOptions;
  }

  return SERVICES[service].fallbackVersions.map((tag, index) => ({
    label: tag,
    tag,
    is_latest: index === 0,
  }));
}

function getSuggestedPort(
  service: ServiceName,
  existingDatabases: Array<Pick<Database, "service" | "port">>,
): string {
  const basePort = Number(SERVICES[service].defaultPort);
  const usedPorts = new Set(
    existingDatabases
      .filter((db) => db.service === service)
      .map((db) => Number(db.port))
      .filter((port) => Number.isFinite(port)),
  );

  let candidate = basePort;
  while (usedPorts.has(candidate)) {
    candidate += 1;
  }

  return String(candidate);
}

function getNextPortCandidate(
  port: string,
  existingDatabases: Array<Pick<Database, "port">>,
): string {
  const numericPort = Number(port);
  const usedPorts = new Set(
    existingDatabases
      .map((db) => Number(db.port))
      .filter((existingPort) => Number.isFinite(existingPort)),
  );

  let candidate = Number.isFinite(numericPort) ? numericPort + 1 : 5433;
  while (candidate <= 65535 && usedPorts.has(candidate)) {
    candidate += 1;
  }

  return String(candidate <= 65535 ? candidate : 5433);
}
