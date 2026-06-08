use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct DockerStatus {
    pub installed: bool,
    pub running: bool,
    pub version: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CreateDatabaseRequest {
    pub engine: String,
    pub name: String,
    pub service: String,
    pub version: String,
    pub port: String,
    pub password: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateDatabaseResult {
    pub success: bool,
    pub container_id: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ServiceVersion {
    pub label: String,
    pub tag: String,
    pub is_latest: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ContainerRuntimeStatus {
    pub exists: bool,
    pub running: bool,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ContainerActionResult {
    pub success: bool,
    pub not_found: bool,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HostPortStatus {
    pub available: bool,
    pub error: Option<String>,
}
