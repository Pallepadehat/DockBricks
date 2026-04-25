use crate::models::CreateDatabaseRequest;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ContainerEngine {
    Docker,
    Podman,
}

impl ContainerEngine {
    pub fn bin(self) -> &'static str {
        match self {
            Self::Docker => "docker",
            Self::Podman => "podman",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Service {
    MariaDb,
    MySql,
    PostgreSql,
    Redis,
}

impl Service {
    pub fn docker_repo(self) -> &'static str {
        match self {
            Self::MariaDb => "mariadb",
            Self::MySql => "mysql",
            Self::PostgreSql => "postgres",
            Self::Redis => "redis",
        }
    }

    pub fn version_depth(self) -> usize {
        match self {
            Self::PostgreSql => 1,
            _ => 2,
        }
    }

    pub fn version_limit(self) -> usize {
        match self {
            Self::PostgreSql => 6,
            Self::Redis => 8,
            _ => 6,
        }
    }
}

#[derive(Debug, Clone)]
pub struct ValidatedCreateDatabaseRequest {
    pub engine: ContainerEngine,
    pub name: String,
    pub service: Service,
    pub version: String,
    pub port: u16,
    pub password: String,
}

pub fn parse_engine(engine: &str) -> Result<ContainerEngine, String> {
    match engine.trim().to_lowercase().as_str() {
        "docker" => Ok(ContainerEngine::Docker),
        "podman" => Ok(ContainerEngine::Podman),
        _ => Err(format!("Unsupported container engine: {engine}")),
    }
}

pub fn parse_service(service: &str) -> Result<Service, String> {
    match service.trim() {
        "MariaDB" => Ok(Service::MariaDb),
        "MySQL" => Ok(Service::MySql),
        "PostgreSQL" => Ok(Service::PostgreSql),
        "Redis" => Ok(Service::Redis),
        _ => Err(format!("Unsupported service: {service}")),
    }
}

pub fn validate_create_request(
    req: CreateDatabaseRequest,
) -> Result<ValidatedCreateDatabaseRequest, String> {
    let engine = parse_engine(&req.engine)?;
    let service = parse_service(&req.service)?;
    let name = validate_name(&req.name)?;
    let version = validate_version(&req.version)?;
    let port = validate_port(&req.port)?;

    Ok(ValidatedCreateDatabaseRequest {
        engine,
        name,
        service,
        version,
        port,
        password: req.password,
    })
}

pub fn validate_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Database name is required.".into());
    }

    if trimmed.len() > 64 {
        return Err("Database name must be 64 characters or fewer.".into());
    }

    Ok(trimmed.to_string())
}

pub fn validate_port(port: &str) -> Result<u16, String> {
    let parsed = port
        .trim()
        .parse::<u16>()
        .map_err(|_| format!("Invalid port: {port}"))?;

    if parsed == 0 {
        return Err("Port must be between 1 and 65535.".into());
    }

    Ok(parsed)
}

pub fn validate_target(target: &str) -> Result<String, String> {
    let trimmed = target.trim();
    if trimmed.is_empty() {
        return Err("Container target is required.".into());
    }
    Ok(trimmed.to_string())
}

pub fn validate_version(version: &str) -> Result<String, String> {
    let trimmed = version.trim();
    if trimmed.is_empty() {
        return Err("Version is required.".into());
    }

    let valid = trimmed
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | '_' | ':'));
    if !valid {
        return Err(format!("Invalid version tag: {version}"));
    }

    Ok(trimmed.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unknown_services() {
        assert!(parse_service("MongoDB").is_err());
    }

    #[test]
    fn validates_port_range() {
        assert_eq!(validate_port("5432").unwrap(), 5432);
        assert!(validate_port("0").is_err());
        assert!(validate_port("70000").is_err());
    }

    #[test]
    fn rejects_invalid_version_characters() {
        assert!(validate_version("17-alpine").is_ok());
        assert!(validate_version("17 latest").is_err());
    }
}
