import type * as React from "react";
import { AlertTriangleIcon, BoxIcon, CheckCircle2Icon, ContainerIcon, Loader2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useContainerEngineStatuses } from "@/hooks/use-container-engine-statuses";
import type { ContainerEngine } from "@/types/models";

type EngineOnboardingProps = {
  onSelectEngine: (engine: ContainerEngine) => void;
};

export function EngineOnboarding({ onSelectEngine }: EngineOnboardingProps) {
  const { statuses, checking, refresh } = useContainerEngineStatuses(true);

  return (
    <main className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-xl bg-card px-6 py-6 text-card-foreground">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Choose Your Container Engine
          </h1>
          <p className="text-sm text-muted-foreground">
            DockBricks can run with Docker or Podman. Pick one to get started.
          </p>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <EngineOption
            engine="docker"
            label="Docker"
            description="Best default for most setups"
            icon={<ContainerIcon className="size-5" />}
            checking={checking}
            installed={statuses.docker?.installed ?? false}
            running={statuses.docker?.running ?? false}
            onSelect={onSelectEngine}
          />

          <EngineOption
            engine="podman"
            label="Podman"
            description="Daemonless container workflow"
            icon={<BoxIcon className="size-5" />}
            checking={checking}
            installed={statuses.podman?.installed ?? false}
            running={statuses.podman?.running ?? false}
            onSelect={onSelectEngine}
          />
        </div>
        <div className="mt-4 flex justify-center">
          <Button variant="ghost" size="sm" onClick={() => void refresh()} disabled={checking}>
            {checking && <Loader2Icon className="size-4 animate-spin" />}
            Check again
          </Button>
        </div>
      </div>
    </main>
  );
}

type EngineOptionProps = {
  engine: ContainerEngine;
  label: string;
  description: string;
  icon: React.ReactNode;
  checking: boolean;
  installed: boolean;
  running: boolean;
  onSelect: (engine: ContainerEngine) => void;
};

function EngineOption({
  engine,
  label,
  description,
  icon,
  checking,
  installed,
  running,
  onSelect,
}: EngineOptionProps) {
  return (
    <Button
      variant="outline"
      className="h-auto justify-start gap-3 px-4 py-4"
      onClick={() => onSelect(engine)}
      disabled={checking || !installed}
    >
      {icon}
      <span className="text-left">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
        <span className="mt-1 flex items-center gap-1 text-xs">
          {checking ? (
            <>
              <Loader2Icon className="size-3 animate-spin" />
              Checking
            </>
          ) : installed ? (
            <>
              <CheckCircle2Icon className="size-3 text-emerald-600" />
              {running ? "Installed and running" : "Installed, not running"}
            </>
          ) : (
            <>
              <AlertTriangleIcon className="size-3 text-destructive" />
              Not installed
            </>
          )}
        </span>
      </span>
    </Button>
  );
}
