use std::net::{Ipv4Addr, TcpListener};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::models::{
    ContainerActionResult, ContainerRuntimeStatus, CreateDatabaseRequest, CreateDatabaseResult,
    DockerStatus, HostPortStatus,
};
use crate::validation::{
    parse_engine, validate_create_request, validate_name, validate_target, ContainerEngine,
    Service, ValidatedCreateDatabaseRequest,
};

pub fn check_container_engine(engine: String) -> DockerStatus {
    let engine = match parse_engine(&engine) {
        Ok(engine) => engine,
        Err(error) => {
            return DockerStatus {
                installed: false,
                running: false,
                version: None,
                error: Some(error),
            };
        }
    };
    let engine_bin = engine.bin();

    let cli_version = Command::new(engine_bin).arg("--version").output();
    let installed_version = match cli_version {
        Ok(out) if out.status.success() => {
            Some(String::from_utf8_lossy(&out.stdout).trim().to_string())
        }
        Ok(out) => {
            let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
            return DockerStatus {
                installed: false,
                running: false,
                version: None,
                error: Some(if err.is_empty() {
                    format!("Could not verify {engine_bin} installation.")
                } else {
                    err
                }),
            };
        }
        Err(e) => {
            return DockerStatus {
                installed: false,
                running: false,
                version: None,
                error: Some(format!("Could not find {engine_bin} CLI: {e}")),
            };
        }
    };

    let output = if engine == ContainerEngine::Podman {
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
                installed: true,
                running: true,
                version: Some(if version.is_empty() {
                    installed_version.unwrap_or_else(|| engine_bin.to_string())
                } else {
                    version
                }),
                error: None,
            }
        }
        Ok(out) => {
            let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
            DockerStatus {
                installed: true,
                running: false,
                version: installed_version,
                error: Some(if err.is_empty() {
                    match engine {
                        ContainerEngine::Podman => "Podman is not available".into(),
                        ContainerEngine::Docker => "docker is not running".into(),
                    }
                } else {
                    err
                }),
            }
        }
        Err(e) => DockerStatus {
            installed: true,
            running: false,
            version: installed_version,
            error: Some(format!("Could not find {engine_bin} CLI: {e}")),
        },
    }
}

pub fn check_host_port(engine: String, port: String) -> HostPortStatus {
    let selected_engine = match parse_engine(&engine) {
        Ok(engine) => engine,
        Err(error) => {
            return HostPortStatus {
                available: false,
                error: Some(error),
            };
        }
    };
    let port = match crate::validation::validate_port(&port) {
        Ok(port) => port,
        Err(error) => {
            return HostPortStatus {
                available: false,
                error: Some(error),
            };
        }
    };

    if let Some(engine) = [selected_engine, other_engine(selected_engine)]
        .into_iter()
        .find(|engine| engine_publishes_host_port(*engine, port))
    {
        return HostPortStatus {
            available: false,
            error: Some(format!(
                "Port {port} is already published by {}.",
                engine_label(engine)
            )),
        };
    }

    if let Err(error) = assert_socket_port_available(port) {
        return HostPortStatus {
            available: false,
            error: Some(format!("Port {port} is already in use: {error}")),
        };
    }

    HostPortStatus {
        available: true,
        error: None,
    }
}

pub fn create_database_blocking(req: CreateDatabaseRequest) -> CreateDatabaseResult {
    match validate_create_request(req) {
        Ok(req) => create_validated_database_blocking(req),
        Err(error) => create_error(error),
    }
}

fn create_validated_database_blocking(req: ValidatedCreateDatabaseRequest) -> CreateDatabaseResult {
    let engine_bin = req.engine.bin();
    let image = resolve_image(req.service, &req.version);
    let container_name = normalize_container_name(&req.name);

    let mut args: Vec<String> = vec![
        "run".into(),
        "-d".into(),
        "--name".into(),
        container_name,
        "-p".into(),
        format!("{}:{}", req.port, req.port),
    ];

    for (key, value) in env_vars(req.service, &req.password) {
        args.push("-e".into());
        args.push(format!("{key}={value}"));
    }

    args.push("--restart".into());
    args.push("unless-stopped".into());
    args.push(image);

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
            create_error(stderr)
        }
        Err(e) => create_error(e.to_string()),
    }
}

pub fn recreate_database_blocking(
    engine: String,
    target: String,
    mut req: CreateDatabaseRequest,
) -> CreateDatabaseResult {
    let engine = match parse_engine(&engine) {
        Ok(engine) => engine,
        Err(error) => return create_error(error),
    };
    let target = match validate_target(&target) {
        Ok(target) => target,
        Err(error) => return create_error(error),
    };

    req.engine = engine.bin().to_string();
    let validated_req = match validate_create_request(req) {
        Ok(req) => req,
        Err(error) => return create_error(error),
    };
    let engine_bin = engine.bin();

    let inspect = Command::new(engine_bin)
        .args([
            "inspect",
            "--format",
            "{{.Name}}|{{.State.Running}}",
            &target,
        ])
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
            return create_error(if stderr.is_empty() {
                "Failed to inspect existing container before recreate.".into()
            } else {
                stderr
            });
        }
        Err(e) => return create_error(e.to_string()),
    };

    let backup_suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let backup_name = format!("dockbricks-backup-{backup_suffix}");

    let rename_old = Command::new(engine_bin)
        .args(["rename", &target, &backup_name])
        .output();
    match rename_old {
        Ok(out) if out.status.success() => {}
        Ok(out) => {
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            return create_error(if stderr.is_empty() {
                "Failed to prepare container for recreate (rename step).".into()
            } else {
                stderr
            });
        }
        Err(e) => return create_error(e.to_string()),
    }

    let created = create_validated_database_blocking(validated_req.clone());
    if created.success {
        if !was_running {
            let target_after_create = created
                .container_id
                .clone()
                .unwrap_or_else(|| normalize_container_name(&validated_req.name));
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

    create_error(
        created
            .error
            .unwrap_or_else(|| "Failed to recreate container.".into()),
    )
}

pub fn rename_container(engine: String, target: String, new_name: String) -> ContainerActionResult {
    let (engine, target) = match validate_engine_and_target(engine, target) {
        Ok(validated) => validated,
        Err(error) => return action_error(error, false),
    };
    let new_name = match validate_name(&new_name) {
        Ok(name) => normalize_container_name(&name),
        Err(error) => return action_error(error, false),
    };

    let output = Command::new(engine.bin())
        .args(["rename", &target, &new_name])
        .output();

    action_result(output)
}

pub fn inspect_container(engine: String, target: String) -> ContainerRuntimeStatus {
    let (engine, target) = match validate_engine_and_target(engine, target) {
        Ok(validated) => validated,
        Err(error) => {
            return ContainerRuntimeStatus {
                exists: false,
                running: false,
                error: Some(error),
            };
        }
    };

    let output = Command::new(engine.bin())
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

pub fn start_container(engine: String, target: String) -> ContainerActionResult {
    run_action(engine, target, "start")
}

pub fn stop_container(engine: String, target: String) -> ContainerActionResult {
    run_action(engine, target, "stop")
}

pub fn delete_container(engine: String, target: String) -> ContainerActionResult {
    let (engine, target) = match validate_engine_and_target(engine, target) {
        Ok(validated) => validated,
        Err(error) => return action_error(error, false),
    };
    let engine_bin = engine.bin();

    let image_id = Command::new(engine_bin)
        .args(["inspect", "--format", "{{.Image}}", &target])
        .output()
        .ok()
        .and_then(|out| {
            if out.status.success() {
                let raw = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if raw.is_empty() {
                    None
                } else {
                    Some(raw)
                }
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
                let _ = Command::new(engine_bin).args(["rmi", &image]).output();
            }

            ContainerActionResult {
                success: true,
                not_found: false,
                error: None,
            }
        }
        result => action_result(result),
    }
}

fn run_action(engine: String, target: String, action: &str) -> ContainerActionResult {
    let (engine, target) = match validate_engine_and_target(engine, target) {
        Ok(validated) => validated,
        Err(error) => return action_error(error, false),
    };

    let output = Command::new(engine.bin()).args([action, &target]).output();
    action_result(output)
}

fn validate_engine_and_target(
    engine: String,
    target: String,
) -> Result<(ContainerEngine, String), String> {
    Ok((parse_engine(&engine)?, validate_target(&target)?))
}

fn assert_socket_port_available(port: u16) -> std::io::Result<()> {
    let unspecified_listener = TcpListener::bind((Ipv4Addr::UNSPECIFIED, port))?;
    drop(unspecified_listener);

    let localhost_listener = TcpListener::bind((Ipv4Addr::LOCALHOST, port))?;
    drop(localhost_listener);

    Ok(())
}

fn engine_publishes_host_port(engine: ContainerEngine, port: u16) -> bool {
    let output = Command::new(engine.bin())
        .args(["ps", "--format", "{{.Ports}}"])
        .output();

    let Ok(output) = output else {
        return false;
    };

    if !output.status.success() {
        return false;
    }

    let needle = format!(":{port}->");
    let bare_needle = format!("{port}->");
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .flat_map(|line| line.split(','))
        .map(str::trim)
        .any(|mapping| mapping.contains(&needle) || mapping.starts_with(&bare_needle))
}

fn other_engine(engine: ContainerEngine) -> ContainerEngine {
    match engine {
        ContainerEngine::Docker => ContainerEngine::Podman,
        ContainerEngine::Podman => ContainerEngine::Docker,
    }
}

fn engine_label(engine: ContainerEngine) -> &'static str {
    match engine {
        ContainerEngine::Docker => "Docker",
        ContainerEngine::Podman => "Podman",
    }
}

fn resolve_image(service: Service, version: &str) -> String {
    let tag = version
        .split_whitespace()
        .next()
        .unwrap_or("latest")
        .trim_end_matches(".x");

    format!("{}:{tag}", service.docker_repo())
}

fn env_vars(service: Service, password: &str) -> Vec<(String, String)> {
    let mut vars = vec![];

    match service {
        Service::MariaDb | Service::MySql => {
            if password.is_empty() {
                vars.push(("MYSQL_ALLOW_EMPTY_PASSWORD".into(), "yes".into()));
            } else {
                vars.push(("MYSQL_ROOT_PASSWORD".into(), password.into()));
            }
        }
        Service::PostgreSql => {
            vars.push((
                "POSTGRES_PASSWORD".into(),
                if password.is_empty() {
                    "postgres".into()
                } else {
                    password.into()
                },
            ));
        }
        Service::Redis => {
            if !password.is_empty() {
                vars.push(("REDIS_PASSWORD".into(), password.into()));
            }
        }
    }

    vars
}

fn normalize_container_name(name: &str) -> String {
    let collapsed = name
        .split_whitespace()
        .collect::<Vec<_>>()
        .join("-")
        .to_lowercase();
    format!("dockbricks-{collapsed}")
}

fn is_not_found_error(stderr: &str) -> bool {
    stderr.contains("No such container") || stderr.contains("No such object")
}

fn create_error(error: String) -> CreateDatabaseResult {
    CreateDatabaseResult {
        success: false,
        container_id: None,
        error: Some(error),
    }
}

fn action_result(output: std::io::Result<std::process::Output>) -> ContainerActionResult {
    match output {
        Ok(out) if out.status.success() => ContainerActionResult {
            success: true,
            not_found: false,
            error: None,
        },
        Ok(out) => {
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            action_error(stderr.clone(), is_not_found_error(&stderr))
        }
        Err(e) => action_error(e.to_string(), false),
    }
}

fn action_error(error: String, not_found: bool) -> ContainerActionResult {
    ContainerActionResult {
        success: false,
        not_found,
        error: Some(error),
    }
}
