import { DiMysql, DiPostgresql, DiRedis } from "react-icons/di";
import { SiMariadb } from "react-icons/si";

import type { ServiceName } from "@/types/models";

type ServiceIconProps = {
  service: ServiceName;
  className?: string;
};

export function ServiceIcon({ service, className }: ServiceIconProps) {
  if (service === "MariaDB") return <SiMariadb className={className} />;
  if (service === "MySQL") return <DiMysql className={className} />;
  if (service === "PostgreSQL") return <DiPostgresql className={className} />;
  return <DiRedis className={className} />;
}
