use regex::Regex;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::{collections::HashSet, process::Command};

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct DockerStatus {
    pub running: bool,
    pub version: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateDatabaseRequest {
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
pub struct ServiceVersion {
    pub label: String,
    pub tag: String,
    pub is_latest: bool,
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

// ── Commands ──────────────────────────────────────────────────────────────────

/// Check whether the Docker daemon is reachable.
#[tauri::command]
fn check_docker() -> DockerStatus {
    let output = Command::new("docker")
        .args(["version", "--format", "{{.Server.Version}}"])
        .output();

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
                    "Docker daemon is not running".into()
                } else {
                    err
                }),
            }
        }
        Err(e) => DockerStatus {
            running: false,
            version: None,
            error: Some(format!("Could not find docker CLI: {}", e)),
        },
    }
}

/// Pull the image if needed and start a named container.
#[tauri::command]
fn create_database(req: CreateDatabaseRequest) -> CreateDatabaseResult {
    let image = resolve_image(&req.service, &req.version);
    let container_name = format!("dockbricks-{}", req.name.to_lowercase().replace(' ', "-"));

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

    let output = Command::new("docker").args(&args).output();

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
        .invoke_handler(tauri::generate_handler![
            check_docker,
            create_database,
            fetch_service_versions,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
