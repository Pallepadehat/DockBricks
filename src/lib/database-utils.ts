import type { Database } from "@/types/models";

export function containerTargetFor(db: Database): string {
  if (db.containerId) return db.containerId;
  return `dockbricks-${db.name.toLowerCase().replace(/\s+/g, "-")}`;
}

export function resolveConnectionPassword(db: Database): string {
  if (db.password) return db.password;
  if (db.service === "PostgreSQL") return "postgres";
  return "";
}

export function buildConnectionString(db: Database): string {
  const host = "localhost";
  const port = db.port;
  const database = encodeURIComponent(db.name);
  const password = resolveConnectionPassword(db);

  switch (db.service) {
    case "MariaDB":
    case "MySQL":
      return password
        ? `mysql://root:${encodeURIComponent(password)}@${host}:${port}/${database}`
        : `mysql://root@${host}:${port}/${database}`;
    case "PostgreSQL":
      return password
        ? `postgresql://postgres:${encodeURIComponent(password)}@${host}:${port}/${database}`
        : `postgresql://postgres@${host}:${port}/${database}`;
    case "Redis":
      return password
        ? `redis://:${encodeURIComponent(password)}@${host}:${port}`
        : `redis://${host}:${port}`;
  }
}

export function humanizeCreateError(
  error: string | null | undefined,
  port: string,
): string {
  if (!error) return "Unknown error";

  if (
    error.includes("port is already allocated") ||
    error.includes("Bind for 0.0.0.0")
  ) {
    const numericPort = Number(port);
    const nextPort = Number.isFinite(numericPort) ? numericPort + 1 : "another";
    return `Port ${port} is already in use on your machine. Choose another host port like ${nextPort}, or stop the service that is already using it.`;
  }

  return error;
}
