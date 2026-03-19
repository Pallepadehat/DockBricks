export type ServiceName = "MariaDB" | "MySQL" | "PostgreSQL" | "Redis";

export type Category = {
  id: string;
  name: string;
};

export type Database = {
  id: string;
  containerId?: string;
  name: string;
  service: ServiceName;
  version: string;
  port: string;
  password: string;
  categoryIds: string[];
};
