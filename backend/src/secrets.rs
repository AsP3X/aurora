// Human: Reject committed defaults and short secrets before the API accepts traffic or signs JWTs.
// Agent: READS Config secret fields; RETURNS Err on weak/short values; CALLED from create_app_state and run.

use crate::config::Config;

/// Minimum length for signing and encryption secrets (JWT, HLS master, presigned URLs, NOS).
pub const MIN_SECRET_LEN: usize = 32;

/// Values that must never be used outside local experiments (see `docs/security-audit.md`).
const KNOWN_WEAK_SECRETS: &[&str] = &[
    "change-me-in-production",
    "change-me-in-production-jwt-secret",
    "dev-jwt-secret-change-me",
    "dev-master-secret-change-me",
    "dev-nos-jwt-secret-change-me",
    "dev-nos-signing-secret-change-me",
];

// Human: True when the value is empty, an init placeholder, or a known weak default from code or compose.
// Agent: TRIMS input; MATCHES KNOWN_WEAK_SECRETS or GENERATE_ME; NO side effects.
pub fn is_weak_secret(value: &str) -> bool {
    let trimmed = value.trim();
    trimmed.is_empty()
        || trimmed == "GENERATE_ME"
        || KNOWN_WEAK_SECRETS.contains(&trimmed)
}

// Human: Fail fast with a field name so operators know which env var to fix.
// Agent: CALLS is_weak_secret + length check; BAILS with anyhow message naming env var.
fn validate_field(env_name: &str, value: &str) -> anyhow::Result<()> {
    if is_weak_secret(value) {
        anyhow::bail!(
            "{env_name} is unset, still GENERATE_ME, or a known weak default. \
             Set a random secret (at least {MIN_SECRET_LEN} characters). \
             For Docker: run `docker compose --profile init run --rm init-env` to create .env, \
             or copy .env.example and replace GENERATE_ME."
        );
    }
    if value.len() < MIN_SECRET_LEN {
        anyhow::bail!(
            "{env_name} must be at least {MIN_SECRET_LEN} characters (got {}).",
            value.len()
        );
    }
    Ok(())
}

// Human: Gate startup so weak JWT/signing/master/NOS secrets cannot serve requests.
// Agent: VALIDATES jwt_secret, signing_secret, master_secret, object_storage_jwt_secret on Config.
pub fn validate_startup_secrets(config: &Config) -> anyhow::Result<()> {
    validate_field("JWT_SECRET", &config.jwt_secret)?;
    validate_field("SIGNING_SECRET", &config.signing_secret)?;
    validate_field("MASTER_SECRET", &config.master_secret)?;
    validate_field("OBJECT_STORAGE_JWT_SECRET", &config.object_storage_jwt_secret)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_legacy_and_compose_weak_defaults() {
        for weak in KNOWN_WEAK_SECRETS {
            assert!(is_weak_secret(weak), "expected weak: {weak}");
        }
        assert!(is_weak_secret("GENERATE_ME"));
        assert!(is_weak_secret(""));
    }

    #[test]
    fn accepts_long_random_looking_secret() {
        assert!(!is_weak_secret("test-jwt-secret-at-least-32-chars-long!!"));
    }
}
