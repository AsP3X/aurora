// Human: Short-lived HMAC-signed stream/artwork tickets so presigned or proxied GETs can authorize without re-checking JWT on every range request.
// Agent: READS signing_secret; EMITS dot-delimited payload + hex HMAC; validate_ticket USES subtle HMAC compare + expiry parse; HTTP maps to Unauthorized via AppError.
use hmac::{Hmac, Mac};
use sha2::Sha256;

use crate::error::AppError;

type HmacSha256 = Hmac<Sha256>;

// Human: Deterministic SHA-256 HMAC over the dot-separated payload using the configured signing secret.
// Agent: READS payload + secret bytes; RETURNS lowercase hex digest; PANICS only if HMAC key init fails (keys are app-controlled strings).
fn compute_hmac(payload: &str, secret: &str) -> String {
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes())
        .expect("HMAC accepts any key size");
    mac.update(payload.as_bytes());
    hex::encode(mac.finalize().into_bytes())
}

/// Returns a signed ticket string: `{song_id}.{user_id}.{expiry_unix}.{hmac_hex}`
// Human: Append UTC expiry derived from TTL to the `(song,user)` pair and attach an HMAC so tampering invalidates the token.
// Agent: READS ttl_secs; WRITES string ticket; NO DB; CALLS compute_hmac on `{song}.{user}.{exp}` payload.
pub fn generate_ticket(song_id: &str, user_id: &str, secret: &str, ttl_secs: u64) -> String {
    let expiry = chrono::Utc::now().timestamp() as u64 + ttl_secs;
    let payload = format!("{}.{}.{}", song_id, user_id, expiry);
    let sig = compute_hmac(&payload, secret);
    format!("{}.{}", payload, sig)
}

/// Validates a ticket, returning `Unauthorized` if the signature, expiry, or song_id is wrong.
// Human: Parse the four ticket segments, recompute HMAC in constant time, enforce expiry wall clock, and bind to the expected song id.
// Agent: READS ticket + expected_song_id + secret; USES mac.verify_slice; RETURNS Ok or AppError::Unauthorized; NO logging here.
pub fn validate_ticket(ticket: &str, expected_song_id: &str, secret: &str) -> Result<(), AppError> {
    // Ticket contains exactly 4 dot-separated segments.
    // UUIDs use hyphens; expiry and hmac use no dots, so splitting on '.' is safe.
    let parts: Vec<&str> = ticket.split('.').collect();
    if parts.len() != 4 {
        return Err(AppError::Unauthorized);
    }

    let (song_id, user_id, expiry_str, provided_sig) = (parts[0], parts[1], parts[2], parts[3]);

    if song_id != expected_song_id {
        return Err(AppError::Unauthorized);
    }

    let payload = format!("{}.{}.{}", song_id, user_id, expiry_str);

    // Constant-time HMAC verification prevents timing attacks.
    let provided_bytes = hex::decode(provided_sig).map_err(|_| AppError::Unauthorized)?;
    let mut mac =
        HmacSha256::new_from_slice(secret.as_bytes()).map_err(|_| AppError::Unauthorized)?;
    mac.update(payload.as_bytes());
    mac.verify_slice(&provided_bytes).map_err(|_| AppError::Unauthorized)?;

    let expiry: i64 = expiry_str.parse().map_err(|_| AppError::Unauthorized)?;
    if chrono::Utc::now().timestamp() > expiry {
        return Err(AppError::Unauthorized);
    }

    Ok(())
}
