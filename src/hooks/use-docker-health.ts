import * as React from "react";
import { checkContainerEngine, type DockerStatus } from "@/lib/tauri-commands";
import type { ContainerEngine } from "@/types/models";

export function useContainerEngineHealth(engine: ContainerEngine) {
  const [dockerStatus, setDockerStatus] = React.useState<DockerStatus | null>(null);
  const [dockerChecking, setDockerChecking] = React.useState(true);
  const [dockerBannerDismissed, setDockerBannerDismissed] = React.useState(false);

  const pollDocker = React.useCallback(async () => {
    setDockerChecking(true);
    try {
      const status = await checkContainerEngine(engine);
      setDockerStatus(status);
      if (status.running) setDockerBannerDismissed(false);
    } catch (error) {
      setDockerStatus({ running: false, version: null, error: String(error) });
    } finally {
      setDockerChecking(false);
    }
  }, [engine]);

  React.useEffect(() => {
    void pollDocker();
    return undefined;
  }, [pollDocker]);

  const showDockerWarning =
    !dockerChecking &&
    dockerStatus !== null &&
    !dockerStatus.running &&
    !dockerBannerDismissed;

  return {
    dockerStatus,
    dockerChecking,
    showDockerWarning,
    pollDocker,
    dismissDockerWarning: () => setDockerBannerDismissed(true),
  };
}
