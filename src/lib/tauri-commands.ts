import { invoke } from "@tauri-apps/api/core"

export interface DockerStatus {
  running: boolean
  version: string | null
  error: string | null
}

export interface CreateDatabaseRequest {
  name: string
  service: string
  version: string
  port: string
  password: string
}

export interface CreateDatabaseResult {
  success: boolean
  container_id: string | null
  error: string | null
}

export interface ServiceVersion {
  label: string
  tag: string
  is_latest: boolean
}

export async function checkDocker(): Promise<DockerStatus> {
  return invoke<DockerStatus>("check_docker")
}

export async function createDatabase(
  req: CreateDatabaseRequest
): Promise<CreateDatabaseResult> {
  return invoke<CreateDatabaseResult>("create_database", { req })
}

export async function fetchServiceVersions(
  service: string
): Promise<ServiceVersion[]> {
  return invoke<ServiceVersion[]>("fetch_service_versions", { service })
}
