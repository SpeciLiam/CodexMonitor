use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use toml_edit::{value, Array, Document, Item};

use crate::codex::home as codex_home;

const AUTOMATIONS_DIR: &str = "automations";
const AUTOMATION_FILE: &str = "automation.toml";
const MEMORY_FILE: &str = "memory.md";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AutomationDto {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub status: String,
    pub rrule: String,
    pub prompt: String,
    pub model: Option<String>,
    pub reasoning_effort: Option<String>,
    pub execution_environment: Option<String>,
    pub cwds: Vec<String>,
    pub created_at: Option<i64>,
    pub updated_at: Option<i64>,
    pub config_path: String,
    pub memory_exists: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AutomationsSettingsDto {
    pub automations_path: String,
    pub automations: Vec<AutomationDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AutomationUpsertInput {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub status: String,
    pub rrule: String,
    pub prompt: String,
    pub model: Option<String>,
    pub reasoning_effort: Option<String>,
    pub execution_environment: Option<String>,
    #[serde(default)]
    pub cwds: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AutomationStatusInput {
    pub id: String,
    pub status: String,
}

pub(crate) fn automations_list_core() -> Result<AutomationsSettingsDto, String> {
    let automations_path = automations_dir()?;
    let mut automations = Vec::new();

    match fs::read_dir(&automations_path) {
        Ok(entries) => {
            for entry in entries.flatten() {
                let path = entry.path();
                if !path.is_dir() {
                    continue;
                }
                let config_path = path.join(AUTOMATION_FILE);
                if !config_path.is_file() {
                    continue;
                }
                if let Ok(automation) = read_automation_from_path(&config_path) {
                    automations.push(automation);
                }
            }
        }
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {}
        Err(err) => return Err(format!("Failed to read automations directory: {err}")),
    }

    automations.sort_by(|left, right| {
        left.name
            .to_lowercase()
            .cmp(&right.name.to_lowercase())
            .then_with(|| left.id.cmp(&right.id))
    });

    Ok(AutomationsSettingsDto {
        automations_path: path_to_string(&automations_path)?,
        automations,
    })
}

pub(crate) fn automations_read_core(id: &str) -> Result<AutomationDto, String> {
    let config_path = automation_config_path(id)?;
    read_automation_from_path(&config_path)
}

pub(crate) fn automations_create_core(
    input: AutomationUpsertInput,
) -> Result<AutomationsSettingsDto, String> {
    let id = normalize_automation_id(&input.id)?;
    let dir = automation_dir_for_id(&id)?;
    let config_path = dir.join(AUTOMATION_FILE);
    if config_path.exists() {
        return Err(format!("automation '{id}' already exists"));
    }
    fs::create_dir_all(&dir).map_err(|err| format!("Failed to create automation: {err}"))?;

    let now = current_time_millis();
    let mut document = Document::new();
    apply_upsert_to_document(&mut document, &input, Some(now), Some(now))?;
    fs::write(&config_path, document.to_string())
        .map_err(|err| format!("Failed to write automation.toml: {err}"))?;

    automations_list_core()
}

pub(crate) fn automations_update_core(
    input: AutomationUpsertInput,
) -> Result<AutomationsSettingsDto, String> {
    let config_path = automation_config_path(&input.id)?;
    let content = fs::read_to_string(&config_path)
        .map_err(|err| format!("Failed to read automation.toml: {err}"))?;
    let mut document = parse_document(&content)?;
    let created_at = read_i64(&document, "created_at");
    apply_upsert_to_document(
        &mut document,
        &input,
        created_at,
        Some(current_time_millis()),
    )?;
    fs::write(&config_path, document.to_string())
        .map_err(|err| format!("Failed to write automation.toml: {err}"))?;
    automations_list_core()
}

pub(crate) fn automations_delete_core(id: &str) -> Result<AutomationsSettingsDto, String> {
    let id = normalize_automation_id(id)?;
    let dir = automation_dir_for_id(&id)?;
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|err| format!("Failed to delete automation: {err}"))?;
    }
    automations_list_core()
}

pub(crate) fn automations_set_status_core(
    input: AutomationStatusInput,
) -> Result<AutomationsSettingsDto, String> {
    let config_path = automation_config_path(&input.id)?;
    let content = fs::read_to_string(&config_path)
        .map_err(|err| format!("Failed to read automation.toml: {err}"))?;
    let mut document = parse_document(&content)?;
    document["status"] = value(normalize_status(&input.status)?);
    document["updated_at"] = value(current_time_millis());
    fs::write(&config_path, document.to_string())
        .map_err(|err| format!("Failed to write automation.toml: {err}"))?;
    automations_list_core()
}

fn read_automation_from_path(config_path: &Path) -> Result<AutomationDto, String> {
    let content = fs::read_to_string(config_path)
        .map_err(|err| format!("Failed to read {}: {err}", config_path.display()))?;
    let document = parse_document(&content)?;
    let id = read_required_string(&document, "id")?;
    let name = read_string(&document, "name").unwrap_or_else(|| id.clone());
    let kind = read_string(&document, "kind").unwrap_or_else(|| "cron".to_string());
    let status = read_string(&document, "status").unwrap_or_else(|| "ACTIVE".to_string());
    let rrule = read_string(&document, "rrule").unwrap_or_default();
    let prompt = read_string(&document, "prompt").unwrap_or_default();
    let cwds = read_string_array(&document, "cwds");
    let parent = config_path
        .parent()
        .ok_or_else(|| "Unable to resolve automation directory".to_string())?;

    Ok(AutomationDto {
        id,
        name,
        kind,
        status,
        rrule,
        prompt,
        model: read_string(&document, "model"),
        reasoning_effort: read_string(&document, "reasoning_effort"),
        execution_environment: read_string(&document, "execution_environment"),
        cwds,
        created_at: read_i64(&document, "created_at"),
        updated_at: read_i64(&document, "updated_at"),
        config_path: path_to_string(config_path)?,
        memory_exists: parent.join(MEMORY_FILE).is_file(),
    })
}

fn apply_upsert_to_document(
    document: &mut Document,
    input: &AutomationUpsertInput,
    created_at: Option<i64>,
    updated_at: Option<i64>,
) -> Result<(), String> {
    let id = normalize_automation_id(&input.id)?;
    document["version"] = value(1);
    document["id"] = value(id);
    document["kind"] = value(normalize_required(&input.kind, "Kind")?);
    document["name"] = value(normalize_required(&input.name, "Name")?);
    document["prompt"] = value(input.prompt.trim().to_string());
    document["status"] = value(normalize_status(&input.status)?);
    document["rrule"] = value(normalize_required(&input.rrule, "RRULE")?);
    set_optional_string(document, "model", input.model.as_deref());
    set_optional_string(
        document,
        "reasoning_effort",
        input.reasoning_effort.as_deref(),
    );
    set_optional_string(
        document,
        "execution_environment",
        input.execution_environment.as_deref(),
    );
    document["cwds"] = value(string_array(&input.cwds));
    if let Some(created_at) = created_at {
        document["created_at"] = value(created_at);
    }
    if let Some(updated_at) = updated_at {
        document["updated_at"] = value(updated_at);
    }
    Ok(())
}

fn set_optional_string(document: &mut Document, key: &str, value_input: Option<&str>) {
    match value_input.map(str::trim).filter(|value| !value.is_empty()) {
        Some(value_input) => document[key] = value(value_input.to_string()),
        None => {
            let _ = document.remove(key);
        }
    }
}

fn string_array(values: &[String]) -> Array {
    let mut array = Array::new();
    for value_input in values {
        let trimmed = value_input.trim();
        if !trimmed.is_empty() {
            array.push(trimmed);
        }
    }
    array
}

fn automations_dir() -> Result<PathBuf, String> {
    Ok(resolve_codex_home()?.join(AUTOMATIONS_DIR))
}

fn automation_dir_for_id(id: &str) -> Result<PathBuf, String> {
    Ok(automations_dir()?.join(normalize_automation_id(id)?))
}

fn automation_config_path(id: &str) -> Result<PathBuf, String> {
    Ok(automation_dir_for_id(id)?.join(AUTOMATION_FILE))
}

fn resolve_codex_home() -> Result<PathBuf, String> {
    codex_home::resolve_default_codex_home()
        .ok_or_else(|| "Unable to resolve CODEX_HOME".to_string())
}

fn normalize_automation_id(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("Automation id is required".to_string());
    }
    let valid = trimmed
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_');
    if !valid {
        return Err(
            "Automation id may only contain letters, numbers, hyphens, and underscores."
                .to_string(),
        );
    }
    Ok(trimmed.to_string())
}

fn normalize_required(value: &str, label: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(format!("{label} is required"));
    }
    Ok(trimmed.to_string())
}

fn normalize_status(value: &str) -> Result<String, String> {
    let normalized = normalize_required(value, "Status")?.to_ascii_uppercase();
    match normalized.as_str() {
        "ACTIVE" | "PAUSED" => Ok(normalized),
        _ => Err("Status must be ACTIVE or PAUSED".to_string()),
    }
}

fn parse_document(content: &str) -> Result<Document, String> {
    content
        .parse::<Document>()
        .map_err(|err| format!("Failed to parse automation.toml: {err}"))
}

fn read_required_string(document: &Document, key: &str) -> Result<String, String> {
    read_string(document, key).ok_or_else(|| format!("automation.toml missing `{key}`"))
}

fn read_string(document: &Document, key: &str) -> Option<String> {
    document
        .get(key)
        .and_then(Item::as_value)
        .and_then(|value| value.as_str())
        .map(str::to_string)
}

fn read_i64(document: &Document, key: &str) -> Option<i64> {
    document
        .get(key)
        .and_then(Item::as_value)
        .and_then(|value| value.as_integer())
}

fn read_string_array(document: &Document, key: &str) -> Vec<String> {
    document
        .get(key)
        .and_then(Item::as_value)
        .and_then(|value| value.as_array())
        .map(|array| {
            array
                .iter()
                .filter_map(|item| item.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default()
}

fn current_time_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default()
}

fn path_to_string(path: &Path) -> Result<String, String> {
    path.to_str()
        .map(str::to_string)
        .ok_or_else(|| "Unable to resolve path".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    static ENV_LOCK: Mutex<()> = Mutex::new(());

    fn with_codex_home<T>(test: impl FnOnce(&Path) -> T) -> T {
        let _guard = ENV_LOCK.lock().expect("lock env");
        let root = std::env::temp_dir().join(format!(
            "codex-monitor-automations-test-{}",
            current_time_millis()
        ));
        let previous = std::env::var("CODEX_HOME").ok();
        std::env::set_var("CODEX_HOME", &root);
        let result = test(&root);
        match previous {
            Some(value) => std::env::set_var("CODEX_HOME", value),
            None => std::env::remove_var("CODEX_HOME"),
        }
        let _ = fs::remove_dir_all(root);
        result
    }

    fn input(id: &str) -> AutomationUpsertInput {
        AutomationUpsertInput {
            id: id.to_string(),
            name: "Daily Review".to_string(),
            kind: "cron".to_string(),
            status: "ACTIVE".to_string(),
            rrule: "FREQ=DAILY".to_string(),
            prompt: "Summarize open work.".to_string(),
            model: Some("gpt-5.4".to_string()),
            reasoning_effort: Some("medium".to_string()),
            execution_environment: Some("local".to_string()),
            cwds: vec!["/repo".to_string()],
        }
    }

    #[test]
    fn rejects_unsafe_ids() {
        assert!(normalize_automation_id("../bad").is_err());
        assert!(normalize_automation_id("bad/slash").is_err());
        assert_eq!(
            normalize_automation_id("daily-review").expect("valid id"),
            "daily-review"
        );
    }

    #[test]
    fn creates_and_lists_automation() {
        with_codex_home(|root| {
            let result = automations_create_core(input("daily-review")).expect("create");
            assert_eq!(result.automations.len(), 1);
            assert_eq!(result.automations[0].id, "daily-review");
            assert!(root
                .join("automations/daily-review/automation.toml")
                .is_file());
        });
    }

    #[test]
    fn preserves_unknown_fields_on_update() {
        with_codex_home(|root| {
            let dir = root.join("automations/daily-review");
            fs::create_dir_all(&dir).expect("dir");
            fs::write(
                dir.join("automation.toml"),
                r#"version = 1
id = "daily-review"
name = "Old"
kind = "cron"
status = "ACTIVE"
rrule = "FREQ=DAILY"
prompt = "Old prompt"
custom_key = "keep me"
"#,
            )
            .expect("write");

            let mut next = input("daily-review");
            next.name = "New".to_string();
            automations_update_core(next).expect("update");
            let content = fs::read_to_string(dir.join("automation.toml")).expect("read");
            assert!(content.contains("custom_key = \"keep me\""));
            assert!(content.contains("name = \"New\""));
        });
    }
}
