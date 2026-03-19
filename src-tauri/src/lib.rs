use std::process::Command;
use serde::{Deserialize, Serialize};

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
    pub service: String,   // "MariaDB" | "MySQL" | "PostgreSQL" | "Redis"
    pub version: String,   // e.g. "17.x (Latest)" → mapped to docker tag
    pub port: String,
    pub password: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateDatabaseResult {
    pub success: bool,
    pub container_id: Option<String>,
    pub error: Option<String>,
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
        "MariaDB"    => format!("mariadb:{}", tag),
        "MySQL"      => format!("mysql:{}", tag),
        "PostgreSQL" => format!("postgres:{}", tag),
        "Redis"      => format!("redis:{}", tag),
        _            => format!("{}:{}", service.to_lowercase(), tag),
    }
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
            vars.push(("POSTGRES_PASSWORD".into(), if password.is_empty() { "postgres".into() } else { password.into() }));
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
                error: Some(if err.is_empty() { "Docker daemon is not running".into() } else { err }),
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
    let container_name = format!(
        "dockbricks-{}",
        req.name.to_lowercase().replace(' ', "-")
    );

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

    let output = Command::new("docker")
        .args(&args)
        .output();

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

// ── App entrypoint ────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            check_docker,
            create_database,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
