use regex::Regex;
use reqwest::Client;
use serde::Deserialize;
use std::collections::HashSet;

use crate::models::ServiceVersion;
use crate::validation::parse_service;

#[derive(Debug, Deserialize)]
struct DockerHubTagsResponse {
    next: Option<String>,
    results: Vec<DockerHubTag>,
}

#[derive(Debug, Deserialize)]
struct DockerHubTag {
    name: String,
}

pub async fn fetch_service_versions_from_docker_hub(
    service_name: &str,
) -> Result<Vec<ServiceVersion>, String> {
    let service = parse_service(service_name)?;
    let numeric_tag_pattern = Regex::new(r"^\d+(?:\.\d+){0,2}$").map_err(|e| e.to_string())?;
    let client = Client::builder()
        .user_agent("dockbricks/0.1.1")
        .build()
        .map_err(|e| e.to_string())?;

    let repo = service.docker_repo();
    let mut next_url = Some(format!(
        "https://hub.docker.com/v2/namespaces/library/repositories/{repo}/tags?page_size=100"
    ));
    let mut families = HashSet::new();
    let mut page_count = 0;
    let depth = service.version_depth();

    while let Some(url) = next_url.take() {
        page_count += 1;
        if page_count > 3 {
            break;
        }

        let response = client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Failed to fetch Docker tags: {e}"))?;

        if !response.status().is_success() {
            return Err(format!("Docker Hub returned {}", response.status()));
        }

        let payload = response
            .json::<DockerHubTagsResponse>()
            .await
            .map_err(|e| format!("Failed to parse Docker tags: {e}"))?;

        for tag in payload.results {
            if let Some(family) = normalize_version_family(&tag.name, depth, &numeric_tag_pattern) {
                families.insert(family);
            }
        }

        if families.len() >= service.version_limit() {
            break;
        }

        next_url = payload.next;
    }

    let mut versions = families.into_iter().collect::<Vec<_>>();
    versions.sort_by(|a, b| compare_versions_desc(a, b));
    versions.truncate(service.version_limit());

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compares_version_families_descending() {
        let mut versions = vec!["15".to_string(), "17".to_string(), "16".to_string()];
        versions.sort_by(|a, b| compare_versions_desc(a, b));
        assert_eq!(versions, vec!["17", "16", "15"]);
    }
}
