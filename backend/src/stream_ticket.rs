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
// Agent: READS ticket + expected_song_id + secret; USES mac.verify_slice; RETURNS Ok or AppError::Unauthorized; DEBUG logs redacted ticket only.
pub fn validate_ticket(ticket: &str, expected_song_id: &str, secret: &str) -> Result<(), AppError> {
    // Ticket contains exactly 4 dot-separated segments.
    // UUIDs use hyphens; expiry and hmac use no dots, so splitting on '.' is safe.
    let parts: Vec<&str> = ticket.split('.').collect();
    if parts.len() != 4 {
        return Err(reject_ticket(ticket, expected_song_id, "malformed_segment_count"));
    }

    let (song_id, user_id, expiry_str, provided_sig) = (parts[0], parts[1], parts[2], parts[3]);

    if song_id != expected_song_id {
        return Err(reject_ticket(ticket, expected_song_id, "song_id_mismatch"));
    }

    let payload = format!("{}.{}.{}", song_id, user_id, expiry_str);

    // Constant-time HMAC verification prevents timing attacks.
    let provided_bytes = hex::decode(provided_sig)
        .map_err(|_| reject_ticket(ticket, expected_song_id, "invalid_hmac_encoding"))?;
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes())
        .map_err(|_| reject_ticket(ticket, expected_song_id, "hmac_init_failed"))?;
    mac.update(payload.as_bytes());
    if mac.verify_slice(&provided_bytes).is_err() {
        return Err(reject_ticket(ticket, expected_song_id, "hmac_mismatch"));
    }

    let expiry: i64 = expiry_str
        .parse()
        .map_err(|_| reject_ticket(ticket, expected_song_id, "invalid_expiry"))?;
    if chrono::Utc::now().timestamp() > expiry {
        return Err(reject_ticket(ticket, expected_song_id, "expired"));
    }

    Ok(())
}

// Human: Failed ticket checks are logged at debug with a redacted ticket string for support, never the HMAC.
// Agent: EMITS tracing::debug with stream_ticket_for_log; RETURNS AppError::Unauthorized.
fn reject_ticket(ticket: &str, expected_song_id: &str, reason: &'static str) -> AppError {
    tracing::debug!(
        reason,
        ticket_redacted = %crate::redact::stream_ticket_for_log(ticket),
        expected_song_id = %expected_song_id,
        "stream ticket rejected"
    );
    AppError::Unauthorized
}
