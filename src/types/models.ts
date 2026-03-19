export type ContainerEngine = "docker" | "podman";

export type ServiceName = "MariaDB" | "MySQL" | "PostgreSQL" | "Redis";

export type Category = {
  id: string;
  name: string;
};

export type Database = {
  id: string;
  containerId?: string;
  engine?: ContainerEngine;
  name: string;
  service: ServiceName;
  version: string;
  port: string;
  password: string;
  categoryIds: string[];
};
