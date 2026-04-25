use crate::container;
use crate::models::{
    ContainerActionResult, ContainerRuntimeStatus, CreateDatabaseRequest, CreateDatabaseResult,
    DockerStatus, HostPortStatus, ServiceVersion,
};
use crate::versions::fetch_service_versions_from_docker_hub;

#[tauri::command]
pub fn check_container_engine(engine: String) -> DockerStatus {
    container::check_container_engine(engine)
}

#[tauri::command]
pub fn check_host_port(engine: String, port: String) -> HostPortStatus {
    container::check_host_port(engine, port)
}

#[tauri::command]
pub async fn create_database(req: CreateDatabaseRequest) -> CreateDatabaseResult {
    tauri::async_runtime::spawn_blocking(move || container::create_database_blocking(req))
        .await
        .unwrap_or_else(|e| CreateDatabaseResult {
            success: false,
            container_id: None,
            error: Some(format!("Failed to create database in background task: {e}")),
        })
}

#[tauri::command]
pub async fn recreate_database(
    engine: String,
    target: String,
    req: CreateDatabaseRequest,
) -> CreateDatabaseResult {
    tauri::async_runtime::spawn_blocking(move || {
        container::recreate_database_blocking(engine, target, req)
    })
    .await
    .unwrap_or_else(|e| CreateDatabaseResult {
        success: false,
        container_id: None,
        error: Some(format!(
            "Failed to recreate database container in background task: {e}"
        )),
    })
}

#[tauri::command]
pub fn rename_container(engine: String, target: String, new_name: String) -> ContainerActionResult {
    container::rename_container(engine, target, new_name)
}

#[tauri::command]
pub fn inspect_container(engine: String, target: String) -> ContainerRuntimeStatus {
    container::inspect_container(engine, target)
}

#[tauri::command]
pub fn start_container(engine: String, target: String) -> ContainerActionResult {
    container::start_container(engine, target)
}

#[tauri::command]
pub fn stop_container(engine: String, target: String) -> ContainerActionResult {
    container::stop_container(engine, target)
}

#[tauri::command]
pub fn delete_container(engine: String, target: String) -> ContainerActionResult {
    container::delete_container(engine, target)
}

#[tauri::command]
pub async fn fetch_service_versions(service: String) -> Result<Vec<ServiceVersion>, String> {
    let versions = fetch_service_versions_from_docker_hub(&service).await?;
    if versions.is_empty() {
        return Err(format!("No versions found for {service}"));
    }
    Ok(versions)
}
