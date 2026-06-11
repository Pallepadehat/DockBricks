import * as React from "react";
import { AlertTriangleIcon, BoxIcon, CheckCircle2Icon, ContainerIcon, Loader2Icon, Settings2Icon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useContainerEngineStatuses } from "@/hooks/use-container-engine-statuses";
import type { AppUpdaterState } from "@/hooks/use-app-updater";
import type { ContainerEngine } from "@/types/models";

type SettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentEngine: ContainerEngine;
  onSave: (engine: ContainerEngine) => void;
};

export function SettingsDialog({
  open,
  onOpenChange,
  currentEngine,
  onSave,
  updater,
}: SettingsDialogProps) {
  const [nextEngine, setNextEngine] = React.useState<ContainerEngine>(currentEngine);
  const { statuses, checking, refresh } = useContainerEngineStatuses(open);

  React.useEffect(() => {
    if (open) setNextEngine(currentEngine);
  }, [currentEngine, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Settings2Icon className="size-4 text-muted-foreground" />
            <DialogTitle>Settings</DialogTitle>
          </div>
        </DialogHeader>

        <section className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Container engine</p>
              <p className="text-xs text-muted-foreground">
                Choose the runtime DockBricks should use.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void refresh()}
              disabled={checking}
            >
              {checking && <Loader2Icon className="size-4 animate-spin" />}
              Check
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setNextEngine("docker")}
              disabled={checking || !statuses.docker?.installed}
              className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left transition-colors ${
                nextEngine === "docker"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted/40"
              }`}
            >
              <ContainerIcon className="size-4" />
              <span>
                <span className="block text-sm font-medium">Docker</span>
                <span className="block text-xs text-muted-foreground">
                  Standard runtime
                </span>
                <EngineStatusLabel
                  checking={checking}
                  installed={statuses.docker?.installed ?? false}
                  running={statuses.docker?.running ?? false}
                />
              </span>
            </button>

            <button
              type="button"
              onClick={() => setNextEngine("podman")}
              disabled={checking || !statuses.podman?.installed}
              className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left transition-colors ${
                nextEngine === "podman"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted/40"
              }`}
            >
              <BoxIcon className="size-4" />
              <span>
                <span className="block text-sm font-medium">Podman</span>
                <span className="block text-xs text-muted-foreground">
                  Daemonless runtime
                </span>
                <EngineStatusLabel
                  checking={checking}
                  installed={statuses.podman?.installed ?? false}
                  running={statuses.podman?.running ?? false}
                />
              </span>
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Changes apply immediately to all container operations.
          </p>
        </section>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onSave(nextEngine);
              onOpenChange(false);
            }}
            disabled={!statuses[nextEngine]?.installed}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UpdatePanel({ updater }: { updater: AppUpdaterState }) {
  const badge = getUpdateBadge(updater.status);

  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3 text-left">
          <span className="mt-0.5 rounded-md  p-1.5 text-muted-foreground">
            <SparklesIcon className="size-4" />
          </span>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium">Updates</p>
              <Badge variant={badge.variant}>{badge.label}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {getUpdateDescription(updater)}
            </p>
          </div>
        </div>
        <UpdateActionButton updater={updater} />
      </div>

      {updater.status === "downloading" && (
        <div className="mt-3 space-y-1.5">
          <Progress value={updater.progress ?? 0} />
          <p className="text-[11px] text-muted-foreground">
            {updater.progress === null
              ? "Downloading update…"
              : `${updater.progress}% downloaded`}
          </p>
        </div>
      )}

      {updater.status === "ready" && (
        <p className="mt-3 rounded-md bg-emerald-500/10 px-2 py-1 text-xs text-emerald-700 dark:text-emerald-300">
          Update installed. Relaunch to finish the upgrade.
        </p>
      )}

      {updater.error && (
        <p className="mt-3 rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">
          {updater.error}
        </p>
      )}
    </div>
  );
}

function SettingRow({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-3 text-left">
          <span className="mt-0.5 text-muted-foreground">{icon}</span>
          <div>
            <p className="text-sm font-medium">{title}</p>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        {action}
      </div>
    </div>
  );
}

function getUpdateBadge(status: AppUpdaterState["status"]): {
  label: string;
  variant: React.ComponentProps<typeof Badge>["variant"];
} {
  if (status === "available") return { label: "Available", variant: "default" };
  if (status === "ready") return { label: "Ready", variant: "default" };
  if (status === "checking") return { label: "Checking", variant: "secondary" };
  if (status === "downloading")
    return { label: "Installing", variant: "secondary" };
  if (status === "unavailable")
    return { label: "Not published", variant: "outline" };
  if (status === "error")
    return { label: "Needs attention", variant: "destructive" };

  return { label: "Current", variant: "outline" };
}

function getUpdateDescription(updater: AppUpdaterState) {
  if (updater.update) {
    return `DockBricks ${updater.update.version} is ready to install from GitHub Releases.`;
  }

  if (updater.status === "unavailable") {
    return "No signed updater manifest has been published yet. Manual checks will work once the next release includes latest.json.";
  }

  if (updater.status === "current") {
    return `You're up to date${updater.currentVersion ? ` on ${updater.currentVersion}` : ""}.`;
  }

  if (updater.status === "checking")
    return "Checking GitHub Releases for a signed update.";
  if (updater.status === "downloading")
    return "Downloading and installing the update securely.";
  if (updater.status === "ready")
    return "Relaunch DockBricks to finish installing the update.";
  if (updater.status === "error")
    return "DockBricks could not complete the update check.";

  return "Check GitHub Releases for signed app updates.";
}

function UpdateActionButton({ updater }: { updater: AppUpdaterState }) {
  if (updater.status === "checking") {
    return (
      <Button type="button" variant="outline" size="sm" disabled>
        <Loader2Icon className="size-4 animate-spin" />
        Checking
      </Button>
    );
  }

  if (updater.status === "available") {
    return (
      <Button
        type="button"
        size="sm"
        onClick={() => void updater.installUpdate()}
      >
        <DownloadIcon className="size-4" />
        Update
      </Button>
    );
  }

  if (updater.status === "downloading") {
    return (
      <Button type="button" variant="outline" size="sm" disabled>
        <Loader2Icon className="size-4 animate-spin" />
        Installing
      </Button>
    );
  }

  if (updater.status === "ready") {
    return (
      <Button
        type="button"
        size="sm"
        onClick={() => void updater.relaunchApp()}
      >
        <RocketIcon className="size-4" />
        Relaunch
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => void updater.checkForUpdate()}
    >
      <RefreshCwIcon className="size-4" />
      Check
    </Button>
  );
}

function EngineStatusLabel({
  checking,
  installed,
  running,
}: {
  checking: boolean;
  installed: boolean;
  running: boolean;
}) {
  if (checking) {
    return (
      <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2Icon className="size-3 animate-spin" />
        Checking
      </span>
    );
  }

  if (!installed) {
    return (
      <span className="mt-1 flex items-center gap-1 text-xs text-destructive">
        <AlertTriangleIcon className="size-3" />
        Not installed
      </span>
    );
  }

  return (
    <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
      <CheckCircle2Icon className="size-3 text-emerald-600" />
      {running ? "Installed and running" : "Installed, not running"}
    </span>
  );
}
