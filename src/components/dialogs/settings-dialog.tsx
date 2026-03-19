import * as React from "react";
import { BoxIcon, ContainerIcon, Loader2Icon, RefreshCcwIcon, Settings2Icon } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import type { UpdaterStatus } from "@/hooks/use-app-updater";
import type { ContainerEngine } from "@/types/models";

type SettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentEngine: ContainerEngine;
  onSave: (engine: ContainerEngine) => void;
  currentVersion: string | null;
  updaterStatus: UpdaterStatus;
  updaterError: string | null;
  availableVersion: string | null;
  updateNotes: string | null;
  updateProgressPercent: number | null;
  onCheckForUpdates: () => Promise<void>;
  onInstallUpdate: () => Promise<void>;
};

export function SettingsDialog({
  open,
  onOpenChange,
  currentEngine,
  onSave,
  currentVersion,
  updaterStatus,
  updaterError,
  availableVersion,
  updateNotes,
  updateProgressPercent,
  onCheckForUpdates,
  onInstallUpdate,
}: SettingsDialogProps) {
  const [nextEngine, setNextEngine] = React.useState<ContainerEngine>(currentEngine);

  React.useEffect(() => {
    if (open) setNextEngine(currentEngine);
  }, [currentEngine, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Settings2Icon className="size-4 text-muted-foreground" />
            <DialogTitle>Settings</DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-2">
          <p className="text-sm font-medium">Container Engine</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setNextEngine("docker")}
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
              </span>
            </button>

            <button
              type="button"
              onClick={() => setNextEngine("podman")}
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
              </span>
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Changes apply immediately to all container operations.
          </p>
        </div>

        <Separator />

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">App Updates</p>
            {renderStatusBadge(updaterStatus)}
          </div>
          <p className="text-xs text-muted-foreground">
            Current version: {currentVersion ? `v${currentVersion}` : "Loading…"}
          </p>

          {updaterStatus === "available" && availableVersion && (
            <Alert>
              <AlertDescription className="text-xs">
                Update available: v{availableVersion}
                {updateNotes ? ` - ${updateNotes}` : ""}
              </AlertDescription>
            </Alert>
          )}

          {(updaterStatus === "downloading" || updaterStatus === "installing") && (
            <div className="space-y-1.5">
              <Progress value={updateProgressPercent ?? 0} />
              <p className="text-xs text-muted-foreground">
                {updaterStatus === "downloading"
                  ? `Downloading${typeof updateProgressPercent === "number" ? ` (${updateProgressPercent}%)` : ""}`
                  : "Installing update…"}
              </p>
            </div>
          )}

          {updaterStatus === "installed" && (
            <Alert>
              <AlertDescription className="text-xs">
                Update installed. Restart DockBricks to run the new version.
              </AlertDescription>
            </Alert>
          )}

          {updaterError && (
            <Alert variant="destructive">
              <AlertDescription className="text-xs">{updaterError}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void onCheckForUpdates()}
              disabled={updaterStatus === "checking" || updaterStatus === "downloading" || updaterStatus === "installing"}
            >
              {updaterStatus === "checking" ? (
                <>
                  <Loader2Icon className="size-4 animate-spin" />
                  Checking…
                </>
              ) : (
                <>
                  <RefreshCcwIcon className="size-4" />
                  Check for updates
                </>
              )}
            </Button>

            <Button
              type="button"
              onClick={() => void onInstallUpdate()}
              disabled={updaterStatus !== "available"}
            >
              Install update
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onSave(nextEngine);
              onOpenChange(false);
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function renderStatusBadge(status: UpdaterStatus) {
  if (status === "checking") return <Badge variant="secondary">Checking</Badge>;
  if (status === "up-to-date") return <Badge variant="outline">Up to date</Badge>;
  if (status === "available") return <Badge>Update available</Badge>;
  if (status === "downloading") return <Badge variant="secondary">Downloading</Badge>;
  if (status === "installing") return <Badge variant="secondary">Installing</Badge>;
  if (status === "installed") return <Badge variant="outline">Installed</Badge>;
  if (status === "error") return <Badge variant="destructive">Error</Badge>;
  return <Badge variant="outline">Idle</Badge>;
}
