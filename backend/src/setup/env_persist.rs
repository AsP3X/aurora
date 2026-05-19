// Human: Best-effort update of local `.env` files so a setup wizard choice survives the next backend restart on dev machines.
// Agent: WRITES DATABASE_URL line in backend/.env or root .env when writable; NO-OP in read-only containers.
use std::path::Path;

// Human: Replace or append a single `KEY=value` line in a dotenv file when the path exists and is writable.
// Agent: READS lines; REWRITES file; RETURNS Ok(true) when updated, Ok(false) when skipped.
fn update_env_key(path: &Path, key: &str, value: &str) -> std::io::Result<bool> {
    if !path.is_file() {
        return Ok(false);
    }

    let content = std::fs::read_to_string(path)?;
    let prefix = format!("{key}=");
    let mut found = false;
    let mut lines: Vec<String> = Vec::new();

    for line in content.lines() {
        if line.starts_with(&prefix) {
            lines.push(format!("{prefix}{value}"));
            found = true;
        } else {
            lines.push(line.to_string());
        }
    }

    if !found {
        lines.push(format!("{prefix}{value}"));
    }

    let mut out = lines.join("\n");
    if !out.ends_with('\n') {
        out.push('\n');
    }
    std::fs::write(path, out)?;
    Ok(true)
}

// Human: Replace or append `DATABASE_URL=` in a dotenv file when the path exists and is writable.
// Agent: READS lines; REWRITES file; RETURNS Ok(true) when updated, Ok(false) when skipped.
fn update_env_file(path: &Path, database_url: &str) -> std::io::Result<bool> {
    update_env_key(path, "DATABASE_URL", database_url)
}

// Human: Try common Aurora env file locations after setup selects a database different from the running process.
// Agent: TRIES backend/.env then .env; RETURNS true if either file was updated.
pub fn try_persist_database_url(database_url: &str) -> bool {
    for path in [Path::new("backend/.env"), Path::new(".env")] {
        if update_env_file(path, database_url).unwrap_or(false) {
            tracing::info!(path = %path.display(), "Updated DATABASE_URL in env file");
            return true;
        }
    }
    false
}

// Human: Try common Aurora env file locations after setup selects storage different from the running process.
// Agent: TRIES backend/.env then .env; WRITES STORAGE_MODE; RETURNS true if either file was updated.
pub fn try_persist_storage_mode(storage_mode: &str) -> bool {
    for path in [Path::new("backend/.env"), Path::new(".env")] {
        if update_env_key(path, "STORAGE_MODE", storage_mode).unwrap_or(false) {
            tracing::info!(path = %path.display(), storage_mode, "Updated STORAGE_MODE in env file");
            return true;
        }
    }
    false
}
