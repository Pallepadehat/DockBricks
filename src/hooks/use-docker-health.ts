import * as React from "react";
import { checkDocker, type DockerStatus } from "@/lib/tauri-commands";

export function useDockerHealth() {
  const [dockerStatus, setDockerStatus] = React.useState<DockerStatus | null>(null);
  const [dockerChecking, setDockerChecking] = React.useState(true);
  const [dockerBannerDismissed, setDockerBannerDismissed] = React.useState(false);

  const pollDocker = React.useCallback(async () => {
    setDockerChecking(true);
    try {
      const status = await checkDocker();
      setDockerStatus(status);
      if (status.running) setDockerBannerDismissed(false);
    } catch (error) {
      setDockerStatus({ running: false, version: null, error: String(error) });
    } finally {
      setDockerChecking(false);
    }
  }, []);

  React.useEffect(() => {
    void pollDocker();
    const timer = setInterval(() => {
      void pollDocker();
    }, 10_000);
    return () => clearInterval(timer);
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
