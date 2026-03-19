import { BoxIcon, ContainerIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ContainerEngine } from "@/types/models";

type EngineOnboardingProps = {
  onSelectEngine: (engine: ContainerEngine) => void;
};

export function EngineOnboarding({ onSelectEngine }: EngineOnboardingProps) {
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
          <Button
            variant="outline"
            className="h-auto justify-start gap-3 px-4 py-4"
            onClick={() => onSelectEngine("docker")}
          >
            <ContainerIcon className="size-5" />
            <span className="text-left">
              <span className="block text-sm font-medium">Docker</span>
              <span className="block text-xs text-muted-foreground">
                Best default for most setups
              </span>
            </span>
          </Button>

          <Button
            variant="outline"
            className="h-auto justify-start gap-3 px-4 py-4"
            onClick={() => onSelectEngine("podman")}
          >
            <BoxIcon className="size-5" />
            <span className="text-left">
              <span className="block text-sm font-medium">Podman</span>
              <span className="block text-xs text-muted-foreground">
                Daemonless container workflow
              </span>
            </span>
          </Button>
        </div>
      </div>
    </main>
  );
}
