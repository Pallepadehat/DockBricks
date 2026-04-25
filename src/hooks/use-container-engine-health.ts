import * as React from "react";
import { checkContainerEngine, type ContainerEngineStatus } from "@/lib/tauri-commands";
import type { ContainerEngine } from "@/types/models";

export function useContainerEngineHealth(engine: ContainerEngine) {
  const [engineStatus, setEngineStatus] = React.useState<ContainerEngineStatus | null>(null);
  const [engineChecking, setEngineChecking] = React.useState(true);
  const [engineBannerDismissed, setEngineBannerDismissed] = React.useState(false);

  const retryEngineCheck = React.useCallback(async () => {
    setEngineChecking(true);
    try {
      const status = await checkContainerEngine(engine);
      setEngineStatus(status);
      if (status.running) setEngineBannerDismissed(false);
    } catch (error) {
      setEngineStatus({ installed: false, running: false, version: null, error: String(error) });
    } finally {
      setEngineChecking(false);
    }
  }, [engine]);

  React.useEffect(() => {
    void retryEngineCheck();
    return undefined;
  }, [retryEngineCheck]);

  const showEngineWarning =
    !engineChecking &&
    engineStatus !== null &&
    !engineStatus.running &&
    !engineBannerDismissed;

  return {
    engineStatus,
    engineChecking,
    showEngineWarning,
    retryEngineCheck,
    dismissEngineWarning: () => setEngineBannerDismissed(true),
  };
}
