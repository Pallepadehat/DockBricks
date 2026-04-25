import * as React from "react";

import { checkContainerEngine, type ContainerEngineStatus } from "@/lib/tauri-commands";
import type { ContainerEngine } from "@/types/models";

type EngineStatusByEngine = Record<ContainerEngine, ContainerEngineStatus | null>;

const INITIAL_STATUSES: EngineStatusByEngine = {
  docker: null,
  podman: null,
};

export function useContainerEngineStatuses(active: boolean) {
  const [statuses, setStatuses] = React.useState<EngineStatusByEngine>(INITIAL_STATUSES);
  const [checking, setChecking] = React.useState(false);

  const refresh = React.useCallback(async () => {
    setChecking(true);
    const engines: ContainerEngine[] = ["docker", "podman"];
    const results = await Promise.all(
      engines.map(async (engine) => {
        try {
          return [engine, await checkContainerEngine(engine)] as const;
        } catch (error) {
          return [
            engine,
            {
              installed: false,
              running: false,
              version: null,
              error: String(error),
            },
          ] as const;
        }
      }),
    );

    setStatuses(Object.fromEntries(results) as EngineStatusByEngine);
    setChecking(false);
  }, []);

  React.useEffect(() => {
    if (!active) return;
    void refresh();
  }, [active, refresh]);

  return { statuses, checking, refresh };
}
