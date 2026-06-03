// Human: Structured HTTP failures from Nebular OS so handlers can map 507/412 to the right API responses.
// Agent: READS status + body from reqwest Response; USED by nebula.rs; CONVERTS to AppError via into_app_error.
use crate::error::AppError;

#[derive(Debug, Clone)]
pub struct StorageHttpError {
    pub status: u16,
    pub body: String,
    pub context: String,
}

impl std::fmt::Display for StorageHttpError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "storage HTTP {} ({})",
            self.status,
            self.context
        )
    }
}

impl std::error::Error for StorageHttpError {}

// Human: Turn Nebula HTTP status codes into stable Aurora API errors (507 full disk, 412 conflicts).
// Agent: DOWNCASTS StorageHttpError; FALLBACK Storage string for other failures.
pub fn into_app_error(err: anyhow::Error) -> AppError {
    if let Some(http) = err.downcast_ref::<StorageHttpError>() {
        return match http.status {
            507 => AppError::StorageFull,
            412 => AppError::Conflict(
                "storage precondition failed; object may already exist or etag mismatch".into(),
            ),
            409 => AppError::Conflict("storage conflict".into()),
            _ => AppError::Storage(format!(
                "Nebular OS {} failed: HTTP {}",
                http.context, http.status
            )),
        };
    }
    AppError::Storage(err.to_string())
}

// Human: Fail fast when Nebula returns a non-success status, preserving the body for logging.
// Agent: READS reqwest Response; RETURNS Ok(()) on 2xx; ERR StorageHttpError otherwise.
pub async fn ensure_success(
    response: reqwest::Response,
    context: &str,
) -> anyhow::Result<()> {
    let status = response.status().as_u16();
    if response.status().is_success() {
        return Ok(());
    }
    let body = response.text().await.unwrap_or_default();
    Err(StorageHttpError {
        status,
        body,
        context: context.to_string(),
    }
    .into())
}
