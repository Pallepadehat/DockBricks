import * as React from "react";
import { AlertTriangleIcon, BoxIcon, CheckCircle2Icon, ContainerIcon, KeyRoundIcon, Loader2Icon, RepeatIcon, Settings2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useContainerEngineStatuses } from "@/hooks/use-container-engine-statuses";
import type { ContainerEngine } from "@/types/models";

type SettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentEngine: ContainerEngine;
  useKeychain: boolean;
  autoSwitchPorts: boolean;
  onSave: (engine: ContainerEngine, useKeychain: boolean, autoSwitchPorts: boolean) => void;
};

export function SettingsDialog({
  open,
  onOpenChange,
  currentEngine,
  useKeychain,
  autoSwitchPorts,
  onSave,
}: SettingsDialogProps) {
  const [nextEngine, setNextEngine] = React.useState<ContainerEngine>(currentEngine);
  const [nextUseKeychain, setNextUseKeychain] = React.useState(useKeychain);
  const [nextAutoSwitchPorts, setNextAutoSwitchPorts] = React.useState(autoSwitchPorts);
  const { statuses, checking, refresh } = useContainerEngineStatuses(open);

  React.useEffect(() => {
    if (open) {
      setNextEngine(currentEngine);
      setNextUseKeychain(useKeychain);
      setNextAutoSwitchPorts(autoSwitchPorts);
    }
  }, [autoSwitchPorts, currentEngine, open, useKeychain]);

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
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">Container Engine</p>
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
        </div>

        <div className="space-y-2">
          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex gap-3 text-left">
                <RepeatIcon className="mt-0.5 size-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Auto port switch</p>
                  <p className="text-xs text-muted-foreground">
                    Automatically pick the next available port when the selected port is blocked.
                  </p>
                </div>
              </div>
              <Switch checked={nextAutoSwitchPorts} onCheckedChange={setNextAutoSwitchPorts} />
            </div>
          </div>

          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex gap-3 text-left">
                <KeyRoundIcon className="mt-0.5 size-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">macOS Keychain passwords</p>
                  <p className="text-xs text-muted-foreground">
                    Store database passwords in the system keychain instead of app storage.
                  </p>
                </div>
              </div>
              <Switch checked={nextUseKeychain} onCheckedChange={setNextUseKeychain} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onSave(nextEngine, nextUseKeychain, nextAutoSwitchPorts);
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
