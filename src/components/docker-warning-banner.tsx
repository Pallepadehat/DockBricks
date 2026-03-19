import { AlertTriangleIcon, RefreshCwIcon } from "lucide-react";

type DockerWarningBannerProps = {
  engineLabel: string;
  onRetry: () => void;
};

export function DockerWarningBanner({
  engineLabel,
  onRetry,
}: DockerWarningBannerProps) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-destructive/20 bg-destructive/10 px-4 py-3 text-sm">
      <AlertTriangleIcon className="size-4 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-destructive">
          {engineLabel} is not running
        </p>
      </div>
      <div className="shrink-0">
        <button
          onClick={onRetry}
          className="flex items-center gap-1.5 text-xs text-destructive/80 transition-colors hover:text-destructive"
        >
          <RefreshCwIcon className="size-3" />
          Retry
        </button>
      </div>
    </div>
  );
}
