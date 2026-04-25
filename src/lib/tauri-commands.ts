import { invoke } from "@tauri-apps/api/core"
import type { ContainerEngine, ServiceName } from "@/types/models"

export interface ContainerEngineStatus {
  installed: boolean
  running: boolean
  version: string | null
  error: string | null
}

export interface CreateDatabaseRequest {
  engine: ContainerEngine
  name: string
  service: ServiceName
  version: string
  port: string
  password: string
}

export interface CreateDatabaseResult {
  success: boolean
  container_id: string | null
  error: string | null
}

export interface RecreateDatabaseRequest {
  engine: ContainerEngine
  target: string
  req: CreateDatabaseRequest
}

export interface ServiceVersion {
  label: string
  tag: string
  is_latest: boolean
}

export interface ContainerRuntimeStatus {
  exists: boolean
  running: boolean
  error: string | null
}

export interface ContainerActionResult {
  success: boolean
  not_found: boolean
  error: string | null
}

export interface HostPortStatus {
  available: boolean
  error: string | null
}

export async function checkContainerEngine(
  engine: ContainerEngine
): Promise<ContainerEngineStatus> {
  return invoke<ContainerEngineStatus>("check_container_engine", { engine })
}

export async function createDatabase(
  req: CreateDatabaseRequest
): Promise<CreateDatabaseResult> {
  return invoke<CreateDatabaseResult>("create_database", { req })
}

export async function fetchServiceVersions(
  service: ServiceName
): Promise<ServiceVersion[]> {
  return invoke<ServiceVersion[]>("fetch_service_versions", { service })
}

export async function checkHostPort(
  engine: ContainerEngine,
  port: string
): Promise<HostPortStatus> {
  return invoke<HostPortStatus>("check_host_port", { engine, port })
}

export async function inspectContainer(
  engine: ContainerEngine,
  target: string
): Promise<ContainerRuntimeStatus> {
  return invoke<ContainerRuntimeStatus>("inspect_container", { engine, target })
}

export async function startContainer(
  engine: ContainerEngine,
  target: string
): Promise<ContainerActionResult> {
  return invoke<ContainerActionResult>("start_container", { engine, target })
}

export async function stopContainer(
  engine: ContainerEngine,
  target: string
): Promise<ContainerActionResult> {
  return invoke<ContainerActionResult>("stop_container", { engine, target })
}

export async function deleteContainer(
  engine: ContainerEngine,
  target: string
): Promise<ContainerActionResult> {
  return invoke<ContainerActionResult>("delete_container", { engine, target })
}

export async function renameContainer(
  engine: ContainerEngine,
  target: string,
  newName: string
): Promise<ContainerActionResult> {
  return invoke<ContainerActionResult>("rename_container", {
    engine,
    target,
    newName,
  })
}

export async function recreateDatabase(
  req: RecreateDatabaseRequest
): Promise<CreateDatabaseResult> {
  return invoke<CreateDatabaseResult>("recreate_database", { ...req })
}
