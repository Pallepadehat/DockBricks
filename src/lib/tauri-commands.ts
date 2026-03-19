import { invoke } from "@tauri-apps/api/core"
import type { ContainerEngine } from "@/types/models"

export interface DockerStatus {
  running: boolean
  version: string | null
  error: string | null
}

export interface CreateDatabaseRequest {
  engine: ContainerEngine
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

export async function checkContainerEngine(
  engine: ContainerEngine
): Promise<DockerStatus> {
  return invoke<DockerStatus>("check_container_engine", { engine })
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
