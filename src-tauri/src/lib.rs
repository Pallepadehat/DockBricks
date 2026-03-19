use regex::Regex;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::{collections::HashSet, process::Command};
use std::time::{SystemTime, UNIX_EPOCH};

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct DockerStatus {
    pub running: bool,
    pub version: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CreateDatabaseRequest {
    pub engine: String, // "docker" | "podman"
    pub name: String,
    pub service: String, // "MariaDB" | "MySQL" | "PostgreSQL" | "Redis"
    pub version: String, // e.g. "17.x (Latest)" → mapped to docker tag
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
pub struct RecreateDatabaseRequest {
    pub engine: String,
    pub target: String,
    pub req: CreateDatabaseRequest,
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
struct DockerHubTagsResponse {
    next: Option<String>,
    results: Vec<DockerHubTag>,
}

#[derive(Debug, Serialize, Deserialize)]
struct DockerHubTag {
    name: String,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Map our human-readable service+version to a Docker image tag.
fn resolve_image(service: &str, version: &str) -> String {
    // Extract the leading version number (e.g. "17.x (Latest)" → "17", "10.11 LTS" → "10.11")
    let tag = version
        .split_whitespace()
        .next()
        .unwrap_or("latest")
        .trim_end_matches(".x");

    match service {
        "MariaDB" => format!("mariadb:{}", tag),
        "MySQL" => format!("mysql:{}", tag),
        "PostgreSQL" => format!("postgres:{}", tag),
        "Redis" => format!("redis:{}", tag),
        _ => format!("{}:{}", service.to_lowercase(), tag),
    }
}

fn service_repo(service: &str) -> Option<&'static str> {
    match service {
        "MariaDB" => Some("mariadb"),
        "MySQL" => Some("mysql"),
        "PostgreSQL" => Some("postgres"),
        "Redis" => Some("redis"),
        _ => None,
    }
}

fn version_depth(service: &str) -> usize {
    match service {
        "PostgreSQL" => 1,
        _ => 2,
    }
}

fn version_limit(service: &str) -> usize {
    match service {
        "PostgreSQL" => 6,
        "Redis" => 8,
        _ => 6,
    }
}

fn normalize_version_family(
    tag: &str,
    depth: usize,
    numeric_tag_pattern: &Regex,
) -> Option<String> {
    if !numeric_tag_pattern.is_match(tag) {
        return None;
    }

    let mut parts = tag.split('.').collect::<Vec<_>>();
    if parts.is_empty() {
        return None;
    }

    parts.truncate(depth.min(parts.len()));
    Some(parts.join("."))
}

fn compare_versions_desc(a: &str, b: &str) -> std::cmp::Ordering {
    let a_parts = a
        .split('.')
        .map(|part| part.parse::<u32>().unwrap_or(0))
        .collect::<Vec<_>>();
    let b_parts = b
        .split('.')
        .map(|part| part.parse::<u32>().unwrap_or(0))
        .collect::<Vec<_>>();

    let max_len = a_parts.len().max(b_parts.len());
    for idx in 0..max_len {
        let a_value = *a_parts.get(idx).unwrap_or(&0);
        let b_value = *b_parts.get(idx).unwrap_or(&0);
        match b_value.cmp(&a_value) {
            std::cmp::Ordering::Equal => continue,
            ordering => return ordering,
        }
    }

    std::cmp::Ordering::Equal
}

async fn fetch_service_versions_from_docker_hub(
    service: &str,
) -> Result<Vec<ServiceVersion>, String> {
    let repo = service_repo(service).ok_or_else(|| format!("Unsupported service: {}", service))?;
    let numeric_tag_pattern = Regex::new(r"^\d+(?:\.\d+){0,2}$").map_err(|e| e.to_string())?;
    let client = Client::builder()
        .user_agent("dockbricks/0.1.0")
        .build()
        .map_err(|e| e.to_string())?;

    let mut next_url = Some(format!(
        "https://hub.docker.com/v2/namespaces/library/repositories/{repo}/tags?page_size=100"
    ));
    let mut families = HashSet::new();
    let mut page_count = 0;
    let depth = version_depth(service);

    while let Some(url) = next_url.take() {
        page_count += 1;
        if page_count > 3 {
            break;
        }

        let response = client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Failed to fetch Docker tags: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Docker Hub returned {}", response.status()));
        }

        let payload = response
            .json::<DockerHubTagsResponse>()
            .await
            .map_err(|e| format!("Failed to parse Docker tags: {}", e))?;

        for tag in payload.results {
            if let Some(family) = normalize_version_family(&tag.name, depth, &numeric_tag_pattern) {
                families.insert(family);
            }
        }

        if families.len() >= version_limit(service) {
            break;
        }

        next_url = payload.next;
    }

    let mut versions = families.into_iter().collect::<Vec<_>>();
    versions.sort_by(|a, b| compare_versions_desc(a, b));
    versions.truncate(version_limit(service));

    Ok(versions
        .into_iter()
        .enumerate()
        .map(|(idx, tag)| ServiceVersion {
            label: tag.clone(),
            tag,
            is_latest: idx == 0,
        })
        .collect())
}

/// Build the list of `-e` env vars appropriate for the service.
fn env_vars(service: &str, password: &str) -> Vec<(String, String)> {
    let mut vars = vec![];

    match service {
        "MariaDB" | "MySQL" => {
            if password.is_empty() {
                vars.push(("MYSQL_ALLOW_EMPTY_PASSWORD".into(), "yes".into()));
            } else {
                vars.push(("MYSQL_ROOT_PASSWORD".into(), password.into()));
            }
        }
        "PostgreSQL" => {
            vars.push((
                "POSTGRES_PASSWORD".into(),
                if password.is_empty() {
                    "postgres".into()
                } else {
                    password.into()
                },
            ));
        }
        "Redis" => {
            if !password.is_empty() {
                // Redis 6+ supports AUTH via env
                vars.push(("REDIS_PASSWORD".into(), password.into()));
            }
        }
        _ => {}
    }

    vars
}

fn is_not_found_error(stderr: &str) -> bool {
    stderr.contains("No such container") || stderr.contains("No such object")
}

fn normalize_engine(engine: &str) -> &'static str {
    match engine.to_lowercase().as_str() {
        "podman" | "pubman" => "podman",
        _ => "docker",
    }
}

fn normalize_container_name(name: &str) -> String {
    let collapsed = name
        .split_whitespace()
        .collect::<Vec<_>>()
        .join("-")
        .to_lowercase();
    format!("dockbricks-{}", collapsed)
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// Check whether the selected container engine daemon/service is reachable.
#[tauri::command]
fn check_container_engine(engine: String) -> DockerStatus {
    let engine_bin = normalize_engine(&engine);
    let output = if engine_bin == "podman" {
        // Podman is daemonless for most local setups, so check client availability.
        Command::new(engine_bin)
            .args(["version", "--format", "{{.Client.Version}}"])
            .output()
    } else {
        Command::new(engine_bin)
            .args(["version", "--format", "{{.Server.Version}}"])
            .output()
    };

    match output {
        Ok(out) if out.status.success() => {
            let version = String::from_utf8_lossy(&out.stdout).trim().to_string();
            DockerStatus {
                running: true,
                version: Some(version),
                error: None,
            }
        }
        Ok(out) => {
            let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
            DockerStatus {
                running: false,
                version: None,
                error: Some(if err.is_empty() {
                    if engine_bin == "podman" {
                        "Podman is not available".into()
                    } else {
                        format!("{} is not running", engine_bin)
                    }
                } else {
                    err
                }),
            }
        }
        Err(e) => DockerStatus {
            running: false,
            version: None,
            error: Some(format!("Could not find {} CLI: {}", engine_bin, e)),
        },
    }
}

/// Pull the image if needed and start a named container.
#[tauri::command]
async fn create_database(req: CreateDatabaseRequest) -> CreateDatabaseResult {
    tauri::async_runtime::spawn_blocking(move || create_database_blocking(req))
        .await
        .unwrap_or_else(|e| CreateDatabaseResult {
            success: false,
            container_id: None,
            error: Some(format!("Failed to create database in background task: {e}")),
        })
}

fn create_database_blocking(req: CreateDatabaseRequest) -> CreateDatabaseResult {
    let engine_bin = normalize_engine(&req.engine);
    let image = resolve_image(&req.service, &req.version);
    let container_name = normalize_container_name(&req.name);

    // Build the docker run command
    let mut args: Vec<String> = vec![
        "run".into(),
        "-d".into(),
        "--name".into(),
        container_name.clone(),
        "-p".into(),
        format!("{}:{}", req.port, req.port),
    ];

    // Append env vars
    for (k, v) in env_vars(&req.service, &req.password) {
        args.push("-e".into());
        args.push(format!("{}={}", k, v));
    }

    // Add restart policy for convenience
    args.push("--restart".into());
    args.push("unless-stopped".into());

    // Image last
    args.push(image.clone());

    let output = Command::new(engine_bin).args(&args).output();

    match output {
        Ok(out) if out.status.success() => {
            let id = String::from_utf8_lossy(&out.stdout).trim().to_string();
            CreateDatabaseResult {
                success: true,
                container_id: Some(id),
                error: None,
            }
        }
        Ok(out) => {
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            CreateDatabaseResult {
                success: false,
                container_id: None,
                error: Some(stderr),
            }
        }
        Err(e) => CreateDatabaseResult {
            success: false,
            container_id: None,
            error: Some(e.to_string()),
        },
    }
}

#[tauri::command]
async fn recreate_database(
    engine: String,
    target: String,
    req: CreateDatabaseRequest,
) -> CreateDatabaseResult {
    tauri::async_runtime::spawn_blocking(move || recreate_database_blocking(engine, target, req))
        .await
        .unwrap_or_else(|e| CreateDatabaseResult {
            success: false,
            container_id: None,
            error: Some(format!(
                "Failed to recreate database container in background task: {e}"
            )),
        })
}

fn recreate_database_blocking(
    engine: String,
    target: String,
    mut req: CreateDatabaseRequest,
) -> CreateDatabaseResult {
    let engine_bin = normalize_engine(&engine);
    req.engine = engine.clone();

    let inspect = Command::new(engine_bin)
        .args(["inspect", "--format", "{{.Name}}|{{.State.Running}}", &target])
        .output();

    let (original_name, was_running) = match inspect {
        Ok(out) if out.status.success() => {
            let raw = String::from_utf8_lossy(&out.stdout).trim().to_string();
            let mut parts = raw.split('|');
            let name = parts
                .next()
                .unwrap_or("")
                .trim()
                .trim_start_matches('/')
                .to_string();
            let running = parts
                .next()
                .unwrap_or("false")
                .trim()
                .eq_ignore_ascii_case("true");
            (name, running)
        }
        Ok(out) => {
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            return CreateDatabaseResult {
                success: false,
                container_id: None,
                error: Some(if stderr.is_empty() {
                    "Failed to inspect existing container before recreate.".into()
                } else {
                    stderr
                }),
            };
        }
        Err(e) => {
            return CreateDatabaseResult {
                success: false,
                container_id: None,
                error: Some(e.to_string()),
            };
        }
    };

    let backup_suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let backup_name = format!("dockbricks-backup-{}", backup_suffix);

    let rename_old = Command::new(engine_bin)
        .args(["rename", &target, &backup_name])
        .output();
    match rename_old {
        Ok(out) if out.status.success() => {}
        Ok(out) => {
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            return CreateDatabaseResult {
                success: false,
                container_id: None,
                error: Some(if stderr.is_empty() {
                    "Failed to prepare container for recreate (rename step).".into()
                } else {
                    stderr
                }),
            };
        }
        Err(e) => {
            return CreateDatabaseResult {
                success: false,
                container_id: None,
                error: Some(e.to_string()),
            };
        }
    }

    let created = create_database_blocking(req.clone());
    if created.success {
        if !was_running {
            let target_after_create = created
                .container_id
                .clone()
                .unwrap_or_else(|| normalize_container_name(&req.name));
            let _ = Command::new(engine_bin)
                .args(["stop", &target_after_create])
                .output();
        }

        let _ = Command::new(engine_bin)
            .args(["rm", "-f", "-v", &backup_name])
            .output();
        return created;
    }

    if !original_name.is_empty() {
        let _ = Command::new(engine_bin)
            .args(["rename", &backup_name, &original_name])
            .output();
    }

    CreateDatabaseResult {
        success: false,
        container_id: None,
        error: created.error,
    }
}

#[tauri::command]
fn rename_container(engine: String, target: String, new_name: String) -> ContainerActionResult {
    let engine_bin = normalize_engine(&engine);
    let normalized_new_name = normalize_container_name(&new_name);
    let output = Command::new(engine_bin)
        .args(["rename", &target, &normalized_new_name])
        .output();

    match output {
        Ok(out) if out.status.success() => ContainerActionResult {
            success: true,
            not_found: false,
            error: None,
        },
        Ok(out) => {
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            ContainerActionResult {
                success: false,
                not_found: is_not_found_error(&stderr),
                error: Some(stderr),
            }
        }
        Err(e) => ContainerActionResult {
            success: false,
            not_found: false,
            error: Some(e.to_string()),
        },
    }
}

#[tauri::command]
fn inspect_container(engine: String, target: String) -> ContainerRuntimeStatus {
    let engine_bin = normalize_engine(&engine);
    let output = Command::new(engine_bin)
        .args(["inspect", "--format", "{{.State.Running}}", &target])
        .output();

    match output {
        Ok(out) if out.status.success() => {
            let raw = String::from_utf8_lossy(&out.stdout).trim().to_string();
            ContainerRuntimeStatus {
                exists: true,
                running: raw.eq_ignore_ascii_case("true"),
                error: None,
            }
        }
        Ok(out) => {
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            if is_not_found_error(&stderr) {
                ContainerRuntimeStatus {
                    exists: false,
                    running: false,
                    error: None,
                }
            } else {
                ContainerRuntimeStatus {
                    exists: false,
                    running: false,
                    error: Some(stderr),
                }
            }
        }
        Err(e) => ContainerRuntimeStatus {
            exists: false,
            running: false,
            error: Some(e.to_string()),
        },
    }
}

#[tauri::command]
fn start_container(engine: String, target: String) -> ContainerActionResult {
    let engine_bin = normalize_engine(&engine);
    let output = Command::new(engine_bin).args(["start", &target]).output();

    match output {
        Ok(out) if out.status.success() => ContainerActionResult {
            success: true,
            not_found: false,
            error: None,
        },
        Ok(out) => {
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            ContainerActionResult {
                success: false,
                not_found: is_not_found_error(&stderr),
                error: Some(stderr),
            }
        }
        Err(e) => ContainerActionResult {
            success: false,
            not_found: false,
            error: Some(e.to_string()),
        },
    }
}

#[tauri::command]
fn stop_container(engine: String, target: String) -> ContainerActionResult {
    let engine_bin = normalize_engine(&engine);
    let output = Command::new(engine_bin).args(["stop", &target]).output();

    match output {
        Ok(out) if out.status.success() => ContainerActionResult {
            success: true,
            not_found: false,
            error: None,
        },
        Ok(out) => {
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            ContainerActionResult {
                success: false,
                not_found: is_not_found_error(&stderr),
                error: Some(stderr),
            }
        }
        Err(e) => ContainerActionResult {
            success: false,
            not_found: false,
            error: Some(e.to_string()),
        },
    }
}

#[tauri::command]
fn delete_container(engine: String, target: String) -> ContainerActionResult {
    let engine_bin = normalize_engine(&engine);
    // Capture image id before deleting the container so we can attempt image cleanup after.
    let image_id = Command::new(engine_bin)
        .args(["inspect", "--format", "{{.Image}}", &target])
        .output()
        .ok()
        .and_then(|out| {
            if out.status.success() {
                let raw = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if raw.is_empty() { None } else { Some(raw) }
            } else {
                None
            }
        });

    let output = Command::new(engine_bin)
        .args(["rm", "-f", "-v", &target])
        .output();

    match output {
        Ok(out) if out.status.success() => {
            if let Some(image) = image_id {
                // Best effort: remove the image. If other containers still reference it,
                // keep the delete successful and leave image cleanup to the user/runtime.
                let _ = Command::new(engine_bin).args(["rmi", &image]).output();
            }

            ContainerActionResult {
                success: true,
                not_found: false,
                error: None,
            }
        }
        Ok(out) => {
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            ContainerActionResult {
                success: false,
                not_found: is_not_found_error(&stderr),
                error: Some(stderr),
            }
        }
        Err(e) => ContainerActionResult {
            success: false,
            not_found: false,
            error: Some(e.to_string()),
        },
    }
}

#[tauri::command]
async fn fetch_service_versions(service: String) -> Result<Vec<ServiceVersion>, String> {
    let versions = fetch_service_versions_from_docker_hub(&service).await?;
    if versions.is_empty() {
        return Err(format!("No versions found for {}", service));
    }
    Ok(versions)
}

// ── App entrypoint ────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            check_container_engine,
            create_database,
            recreate_database,
            fetch_service_versions,
            inspect_container,
            start_container,
            stop_container,
            delete_container,
            rename_container,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
