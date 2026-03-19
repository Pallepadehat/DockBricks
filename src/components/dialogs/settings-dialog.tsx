import * as React from "react";
import { BoxIcon, ContainerIcon, Settings2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
